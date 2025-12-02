import pMap from 'p-map'
import ProgressBar from 'progress'
import { parseRange } from 'semver-utils'
import packageManagers from '../package-managers'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { supportedVersionTargets } from '../types/Target'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'
import getPackageManager from './getPackageManager'
import keyValueBy from './keyValueBy'
import programError from './programError'
import { createNpmAlias, isGitHubUrl, isPre, parseNpmAlias } from './version-util'

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are current versions. May include npm aliases, i.e. { "package": "npm:other-package@1.0.0" }
 * @param [options={}] Options. Default: { target: 'latest' }.
 * @returns Promised {packageName: version} collection
 */
async function queryVersions(packageMap: Index<VersionSpec>, options: Options = {}): Promise<Index<VersionResult>> {
  const { default: chalkDefault, Chalk } = await import('chalk')
  const chalk = options.color ? new Chalk({ level: 1 }) : chalkDefault
  const packageList = Object.keys(packageMap)
  const globalPackageManager = getPackageManager(options, options.packageManager)

  let bar: ProgressBar | undefined
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && packageList.length > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: packageList.length, width: 20 })
    bar.render()
  }

  /**
   * Ignore 404 errors from getPackageVersion by having them return `null`
   * instead of rejecting.
   *
   * @param dep
   * @returns
   */
  async function getPackageVersionProtected(dep: VersionSpec): Promise<VersionResult> {
    const npmAlias = parseNpmAlias(packageMap[dep])
    const [name, version] = npmAlias || [dep, packageMap[dep]]
    const targetOption = options.target || 'latest'
    const targetString = typeof targetOption === 'string' ? targetOption : targetOption(name, parseRange(version))
    const [target, distTag] = targetString.startsWith('@')
      ? ['distTag', targetString.slice(1)]
      : [targetString, 'latest']

    const cached = options.cacher?.get(name, target)
    if (cached) {
      bar?.tick()

      return {
        version: cached,
      }
    }

    let versionResult: VersionResult
    const isGitHubDependency = isGitHubUrl(packageMap[dep])

    // use gitTags package manager for git urls (for this dependency only)
    const packageManager = isGitHubDependency ? packageManagers.gitTags : globalPackageManager
    const packageManagerName = isGitHubDependency ? 'github urls' : options.packageManager || 'npm'

    const getPackageVersion = packageManager[target as keyof typeof packageManager] as GetVersion

    if (!getPackageVersion) {
      const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
      programError(
        options,
        chalk.red(`\nUnsupported target "${target}" using ${packageManagerName}`) +
          `\nSupported version targets are: ` +
          packageManagerSupportedVersionTargets.join(', ') +
          (!isGitHubDependency ? ', and tags (e.g. @next)' : ''),
        { color: false },
      )
    }

    try {
      versionResult = await getPackageVersion(name, version, {
        ...options,
        distTag,
        // upgrade prereleases to newer prereleases by default
        // allow downgrading when explicit tag is used
        pre: options.pre != null ? options.pre : targetString.startsWith('@') || isPre(version),
        retry: options.retry ?? 2,
      }).catch(reason => {
        // This might happen if a (private) package cannot be accessed due to a missing or invalid token.
        return { error: reason?.body?.error || reason.toString() }
      })

      versionResult.version =
        !isGitHubDependency && npmAlias && versionResult?.version
          ? createNpmAlias(name, versionResult.version)
          : (versionResult?.version ?? null)
    } catch (err: any) {
      const errorMessage = err ? (err.message || err).toString() : ''
      if (errorMessage.match(/E504|Gateway Timeout/i)) {
        return {
          error: `${errorMessage}. All ${options.retry} retry attempts failed.`,
        }
      } else if (errorMessage.match(/E400|E404|ENOTFOUND|404 Not Found|400 Bad Request/i)) {
        return {
          error: `${errorMessage.replace(/ - Not found$/i, '')}. All ${
            options.retry
          } retry attempts failed. Either your internet connection is down, the registry is inaccessible, the authentication credentials are invalid, or the package does not exist.`,
        }
      } else if (err.code === 'ERR_INVALID_URL') {
        return {
          error: errorMessage || 'Invalid URL',
        }
      } else {
        // print a hint about the --timeout option for network timeout errors
        if (!process.env.NCU_TESTS && /(Response|network) timeout/i.test(errorMessage)) {
          console.error(
            '\n\n' +
              chalk.red(
                'FetchError: Request Timeout. npm-registry-fetch defaults to 30000 (30 seconds). Try setting the --timeout option (in milliseconds) to override this.',
              ) +
              '\n',
          )
        }

        throw err
      }
    }

    bar?.tick()

    if (versionResult.version) {
      options.cacher?.set(name, target, versionResult.version)
    }

    return versionResult
  }

  const versionResultList = await pMap(packageList, getPackageVersionProtected, { concurrency: options.concurrency })

  // save cacher only after pMap handles cacher.set
  await options.cacher?.save()
  options.cacher?.log()

  const versionResultObject = keyValueBy(versionResultList, (versionResult, i) =>
    versionResult.version || versionResult.error
      ? {
          [packageList[i]]: versionResult,
        }
      : null,
  )

  return versionResultObject
}

export default queryVersions
