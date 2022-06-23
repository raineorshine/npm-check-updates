import chalk from 'chalk'
import pMap from 'p-map'
import ProgressBar from 'progress'
import { parseRange } from 'semver-utils'
import getPackageManager from './getPackageManager'
import packageManagers from '../package-managers'
import { createNpmAlias, isGithubUrl, isPre, parseNpmAlias } from '../version-util'
import keyValueBy from './keyValueBy'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'

const supportedVersionTargets = ['latest', 'newest', 'greatest', 'minor', 'patch']

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are current versions. May include npm aliases, i.e. { "package": "npm:other-package@1.0.0" }
 * @param [options={}] Options. Default: { target: 'latest' }.
 * @returns Promised {packageName: version} collection
 */
async function queryVersions(packageMap: Index<VersionSpec>, options: Options = {}): Promise<Index<VersionResult>> {
  const target = options.target || 'latest'
  const packageList = Object.keys(packageMap)
  const globalPackageManager = getPackageManager(options.packageManager)

  let bar: ProgressBar
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
    let targetResult = typeof target === 'string' ? target : target(name, parseRange(version))
    let distTag = 'latest'

    if (targetResult[0] === '@') {
      distTag = targetResult.slice(1)
      targetResult = 'distTag'
    }

    let versionNew: Version | null = null
    const isGithubDependency = isGithubUrl(packageMap[dep])

    // use gitTags package manager for git urls (for this dependency only)
    const packageManager = isGithubDependency ? packageManagers.gitTags : globalPackageManager
    const packageManagerName = isGithubDependency ? 'github urls' : options.packageManager || 'npm'

    const getPackageVersion = packageManager[targetResult as keyof typeof packageManager] as GetVersion

    if (!getPackageVersion) {
      const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
      return Promise.reject(
        new Error(
          `Unsupported target "${targetResult}" for ${packageManagerName}. Supported version targets are: ` +
            packageManagerSupportedVersionTargets.join(', ') +
            (!isGithubDependency ? ' and custom distribution tags, following "@" (example: @next)' : ''),
        ),
      )
    }

    try {
      versionNew = await getPackageVersion(name, version, {
        ...options,
        // upgrade prereleases to newer prereleases by default
        distTag,
        pre: options.pre != null ? options.pre : distTag !== 'latest' || isPre(version),
        retry: options.retry ?? 2,
      })

      versionNew = !isGithubDependency && npmAlias && versionNew ? createNpmAlias(name, versionNew) : versionNew
    } catch (err: any) {
      const errorMessage = err ? (err.message || err).toString() : ''
      if (errorMessage.match(/E404|ENOTFOUND|404 Not Found/i)) {
        return {
          error: `${errorMessage.replace(
            / - Not found$/i,
            '',
          )}. Either your internet connection is down or unstable and all ${
            options.retry
          } retry attempts failed, or the registry is not accessible, or the package does not exist.`,
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

    if (bar) {
      bar.tick()
    }

    return {
      version: versionNew,
    }
  }

  const versionResultList = await pMap(packageList, getPackageVersionProtected, { concurrency: options.concurrency })

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
