import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import filterAndReject from './filterAndReject.ts'
import getPackageManager from './getPackageManager.ts'
import programError from './programError.ts'
import filterObject from './utils/filterObject.ts'
import { isWildPart } from './version-util.ts'

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
  let filteredPackages: Index<VersionSpec> = {}
  try {
    filteredPackages = filterObject(
      packages,
      (dep: VersionSpec, version: Version) => !!version && !isWildPart(version) && filterFunction(dep, version),
    )
  } catch (err: any) {
    programError(options, 'Invalid filter: ' + err.message || err)
  }

  return filteredPackages
}

export default getInstalledPackages
