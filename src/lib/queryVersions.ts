import _ from 'lodash'
import cint from 'cint'
import chalk from 'chalk'
import pMap from 'p-map'
import ProgressBar from 'progress'
import { parseRange } from 'semver-utils'
import { supportedVersionTargets } from '../constants'
import getPackageManager from './getPackageManager'
import packageManagers from '../package-managers'
import { createNpmAlias, isGithubUrl, isPre, parseNpmAlias } from '../version-util'
import { GetVersion, Index, Options, Version, VersionSpec } from '../types'

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are current versions. May include npm aliases, i.e. { "package": "npm:other-package@1.0.0" }
 * @param [options={}] Options. Default: { target: 'latest' }.
 * @returns Promised {packageName: version} collection
 */
async function queryVersions(packageMap: Index<VersionSpec>, options: Options = {}) {

  const target = options.target || 'latest'
  const packageList = Object.keys(packageMap)
  const packageManager = getPackageManager(options.packageManager)

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
  async function getPackageVersionProtected(dep: VersionSpec): Promise<Version | null> {

    const npmAlias = parseNpmAlias(packageMap[dep])
    const [name, version] = npmAlias || [dep, packageMap[dep]]
    const targetResult = typeof target === 'string' ? target : target(name, parseRange(version))

    let versionNew: Version | null = null

    // use gitTags package manager for git urls
    if (isGithubUrl(packageMap[dep])) {

      // override packageManager and getPackageVersion just for this dependency
      const packageManager = packageManagers.gitTags
      const getPackageVersion = packageManager[targetResult as keyof typeof packageManager] as GetVersion

      if (!getPackageVersion) {
        const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
        return Promise.reject(new Error(`Unsupported target "${targetResult}" for github urls. Supported version targets are: ${packageManagerSupportedVersionTargets.join(', ')}`))
      }
      versionNew = await getPackageVersion(name, version, {
        ...options,
        // upgrade prereleases to newer prereleases by default
        pre: options.pre != null ? options.pre : isPre(version),
      })
    }
    else {
      // set the getPackageVersion function from options.target
      // TODO: Remove "as GetVersion" and fix types
      const getPackageVersion = packageManager[targetResult as keyof typeof packageManager] as GetVersion
      if (!getPackageVersion) {
        const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
        return Promise.reject(new Error(`Unsupported target "${targetResult}" for ${options.packageManager || 'npm'}. Supported version targets are: ${packageManagerSupportedVersionTargets.join(', ')}`))
      }

      try {
        versionNew = await getPackageVersion(name, version, {
          ...options,
          // upgrade prereleases to newer prereleases by default
          pre: options.pre != null ? options.pre : isPre(version),
          retry: options.retry ?? 2,
        })
        versionNew = npmAlias && versionNew ? createNpmAlias(name, versionNew) : versionNew
      }
      catch (err: any) {
        const errorMessage = err ? (err.message || err).toString() : ''
        if (!errorMessage.match(/E404|ENOTFOUND|404 Not Found/i)) {
          // print a hint about the --timeout option for network timeout errors
          if (!process.env.NCU_TESTS && /(Response|network) timeout/i.test(errorMessage)) {
            console.error('\n\n' + chalk.red('FetchError: Request Timeout. npm-registry-fetch defaults to 30000 (30 seconds). Try setting the --timeout option (in milliseconds) to override this.') + '\n')
          }

          throw err
        }
      }
    }

    if (bar) {
      bar.tick()
    }

    return versionNew
  }

  /**
   * Zip up the array of versions into to a nicer object keyed by package name.
   *
   * @param versionList
   * @returns
   */
  const zipVersions = (versionList: (Version | null)[]) =>
    cint.toObject(versionList, (version, i) => ({
      [packageList[i]]: version
    }))

  const versions = await pMap(packageList, getPackageVersionProtected, { concurrency: options.concurrency })

  return _.pickBy(zipVersions(versions), _.identity)
}

export default queryVersions
