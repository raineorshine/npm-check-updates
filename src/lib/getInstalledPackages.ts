import cint from 'cint'
import { isWildPart } from '../version-util'
import getPackageManager from './getPackageManager'
import filterAndReject from './filterAndReject'
import { Options, Version, VersionSpec } from '../types'

/**
 * @param [options]
 * @param options.cwd
 * @param options.filter
 * @param options.global
 * @param options.packageManager
 * @param options.prefix
 * @param options.reject
 */
async function getInstalledPackages(options: Options = {}) {

  const pkgInfoObj = await getPackageManager(options.packageManager)
    .list?.({ cwd: options.cwd, prefix: options.prefix, global: options.global })

  if (!pkgInfoObj) {
    throw new Error('Unable to retrieve NPM package list')
  }

  // filter out undefined packages or those with a wildcard
  const filterFunction = filterAndReject(options.filter, options.reject, options.filterVersion, options.rejectVersion)
  return cint.filterObject(pkgInfoObj, (dep: VersionSpec, version: Version) =>
    !!version && !isWildPart(version) && filterFunction(dep, version)
  )

}

export default getInstalledPackages
