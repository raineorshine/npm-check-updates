import pMap from 'p-map'
import { parseRange } from 'semver-utils'
import packageManagers from '../package-managers/index.ts'
import { type GetVersion } from '../types/GetVersion.ts'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { supportedVersionTargets } from '../types/Target.ts'
import { type VersionResult } from '../types/VersionResult.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import { getChalk } from './chalk.ts'
import getPackageManager from './getPackageManager.ts'
import isPackageManagerProtocol from './isPackageManagerProtocol.ts'
import keyValueBy from './keyValueBy.ts'
import { createProgressBar } from './logging.ts'
import programError from './programError.ts'
import { createNpmAlias, isGitHubUrl, isPre, parseNpmAlias } from './version-util.ts'

/**
 * Get the latest or greatest versions from the npm repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are current versions. May include npm aliases, i.e. { "package": "npm:other-package@1.0.0" }
 * @param [options={}] Options. Default: { target: 'latest' }.
 * @returns Promised {packageName: version} collection
 */
async function queryVersions(packageMap: Index<VersionSpec>, options: Options = {}): Promise<Index<VersionResult>> {
  const chalk = getChalk(options.color)
  const packageList = Object.keys(packageMap)
  const globalPackageManager = getPackageManager(options, options.packageManager)

  const bar = createProgressBar(options, packageList.length)

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

    // Skip valid specs that are not registry versions, such as different package manager protocols.
    if (isPackageManagerProtocol(version)) {
      bar?.tick()
      return { version: null }
    }

    const targetOption = options.target || 'latest'
    const targetString = typeof targetOption === 'string' ? targetOption : targetOption(name, parseRange(version))
    const [target, distTag] = targetString.startsWith('@')
      ? ['distTag', targetString.slice(1)]
      : [targetString, 'latest']

    // Skip the cache if cooldown is active since current cache does not store
    // timestamp constraints; otherwise, validate based on version and time presence.
    if (!options.cooldown) {
      const cached = options.cacher?.get(name, target)
      const isValidCache = cached?.version && (cached?.time || !options.format?.includes('time'))
      if (isValidCache) {
        bar?.tick()

        return cached
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

    // report the same count that was actually passed to the package manager
    const retry = options.retry ?? 2

    try {
      versionResult = await getPackageVersion(name, version, {
        ...options,
        distTag,
        // upgrade prereleases to newer prereleases by default
        // allow downgrading when explicit tag is used
        pre: options.pre != null ? options.pre : targetString.startsWith('@') || isPre(version),
        retry,
      })
    } catch (err: any) {
      const errorMessage = err ? (err.message || err).toString() : ''
      if (errorMessage.match(/E504|Gateway Timeout/i)) {
        versionResult = {
          error: `${errorMessage}. All ${retry} retry attempts failed.`,
        }
      } else if (errorMessage.match(/E400|E404|ENOTFOUND|404 Not Found|400 Bad Request/i)) {
        versionResult = {
          error: `${errorMessage.replace(/ - Not found$/i, '')}. All ${retry} retry attempts failed. Either your internet connection is down, the registry is inaccessible, the authentication credentials are invalid, or the package does not exist.`,
        }
      } else if (err?.code === 'ERR_INVALID_URL') {
        versionResult = {
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

        // This might happen if a (private) package cannot be accessed due to a missing or invalid token.
        versionResult = { error: err?.body?.error || String(err) }
      }
    }

    versionResult.version =
      !isGitHubDependency && npmAlias && versionResult?.version
        ? createNpmAlias(name, versionResult.version)
        : (versionResult?.version ?? null)

    bar?.tick()

    // don't cache the cooldown fallback under the plain key (see the skipped read above)
    if (versionResult.version && !options.cooldown) {
      options.cacher?.set(name, target, versionResult.version, versionResult.time)
    }

    return versionResult
  }

  const versionResultList = await pMap(packageList, getPackageVersionProtected, { concurrency: options.concurrency })

  // save cacher only after pMap handles cacher.set
  await options.cacher?.save()
  options.cacher?.log()

  const versionResultObject = keyValueBy(versionResultList, (versionResult, i) =>
    versionResult.version || versionResult.error || versionResult.cooldownInfo
      ? {
          [packageList[i]]: versionResult,
        }
      : null,
  )

  return versionResultObject
}

export default queryVersions
