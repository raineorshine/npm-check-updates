import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import filterAndReject from './filterAndReject'
import filterObject from './filterObject'
import getPackageManager from './getPackageManager'
import programError from './programError'
import { isWildPart } from './version-util'

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
  const packages = await getPackageManager(options, options.packageManager).list?.({
    cwd: options.cwd,
    prefix: options.prefix,
    global: options.global,
  })

  if (!packages) {
    programError(options, 'Unable to retrieve package list')
  }

  // filter out undefined packages or those with a wildcard
  const filterFunction = filterAndReject(options.filter, options.reject, options.filterVersion, options.rejectVersion)
  return filterObject(
    packages,
    (dep: VersionSpec, version: Version) => !!version && !isWildPart(version) && filterFunction(dep, version),
  )
}

export default getInstalledPackages
