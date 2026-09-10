import pMap from 'p-map'
import { parseRange } from 'semver-utils'
import packageManagers from '../package-managers/index.ts'
import { type GetVersion } from '../types/GetVersion.ts'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { supportedVersionTargets } from '../types/Target.ts'
import { type VersionResult } from '../types/VersionResult.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getPackageManager from './getPackageManager.ts'
import isPackageManagerProtocol from './isPackageManagerProtocol.ts'
import keyValueBy from './keyValueBy.ts'
import { createProgressBar } from './logging.ts'
import programError from './programError.ts'
import { getStyle } from './style.ts'
import {
  JSR_NPM_SCOPE,
  JSR_REGISTRY,
  createJsrSpec,
  createNpmAlias,
  fromJsrNpmName,
  isGitHubUrl,
  isPre,
  parseJsrSpec,
  parseNpmAlias,
  toJsrNpmName,
  upgradeJsrSpec,
} from './version-util.ts'

/**
 * Get the latest or greatest versions from the npm repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are current versions. May include npm aliases, i.e. { "package": "npm:other-package@1.0.0" }
 * @param [options={}] Options. Default: { target: 'latest' }.
 * @returns Promised {packageName: version} collection
 */
async function queryVersions(packageMap: Index<VersionSpec>, options: Options = {}): Promise<Index<VersionResult>> {
  const style = getStyle(options.color)
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
    const spec = packageMap[dep]
    const jsrSpec = parseJsrSpec(spec)
    const npmAlias = jsrSpec ? null : parseNpmAlias(spec)

    // a static registry replaces all registry lookups, so resolve jsr: specs from it by package name
    const isJsrDependency = !!jsrSpec && options.registryType !== 'json'

    // jsr packages are published to jsr's npm-compatible registry under a mangled name
    const jsrName = jsrSpec ? (isJsrDependency ? toJsrNpmName(jsrSpec[0] ?? dep) : (jsrSpec[0] ?? dep)) : null

    // every JSR package name is @scope/name, so a bare jsr: version on an unscoped key cannot be resolved
    if (jsrSpec && !jsrName) {
      bar?.tick()
      return { error: `Invalid JSR package name "${dep}" for "${spec}". Expected "@scope/name".` }
    }

    const [name, version] = jsrSpec ? [jsrName!, jsrSpec[1]] : npmAlias || [dep, spec]

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
    const isGitHubDependency = isGitHubUrl(spec)

    // use a dedicated package manager for git urls and jsr: specs (for this dependency only)
    const packageManager = isGitHubDependency
      ? packageManagers.gitTags
      : isJsrDependency
        ? packageManagers.jsr
        : globalPackageManager
    const packageManagerName = isGitHubDependency
      ? 'github urls'
      : isJsrDependency
        ? 'jsr'
        : options.packageManager || 'npm'

    const getPackageVersion = packageManager[target as keyof typeof packageManager] as GetVersion

    if (!getPackageVersion) {
      const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
      programError(
        options,
        style.red(`\nUnsupported target "${target}" using ${packageManagerName}`) +
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
        // JSR publishes to its own npm-compatible registry, so a 404 elsewhere means the @jsr scope is unconfigured
        const jsrName = !isJsrDependency && !errorMessage.includes(JSR_REGISTRY) ? fromJsrNpmName(name) : null
        versionResult = {
          error:
            `${errorMessage.replace(/ - Not found$/i, '')}. All ${retry} retry attempts failed. Either your internet connection is down, the registry is inaccessible, the authentication credentials are invalid, or the package does not exist.` +
            (jsrName
              ? ` ${name} is a JSR package: add "${JSR_NPM_SCOPE}:registry=${JSR_REGISTRY}" to .npmrc, or declare it as "${createJsrSpec(jsrName, version)}".`
              : ''),
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
              style.red(
                'FetchError: Request Timeout. npm-registry-fetch defaults to 30000 (30 seconds). Try setting the --timeout option (in milliseconds) to override this.',
              ) +
              '\n',
          )
        }

        // This might happen if a (private) package cannot be accessed due to a missing or invalid token.
        versionResult = { error: err?.body?.error || String(err) }
      }
    }

    // rewrap the fetched version in the shape it was declared in, so both jsr: forms round-trip
    versionResult.version = !versionResult?.version
      ? null
      : jsrSpec
        ? upgradeJsrSpec(spec, versionResult.version)
        : !isGitHubDependency && npmAlias
          ? createNpmAlias(name, versionResult.version)
          : versionResult.version

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
