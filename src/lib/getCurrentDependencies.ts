import * as semver from 'semver'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { VersionSpec } from '../types/VersionSpec'
import filterAndReject from './filterAndReject'
import filterObject from './filterObject'
import { keyValueBy } from './keyValueBy'

/** Returns true if spec1 is greater than spec2, ignoring invalid version ranges. */
const isGreaterThanSafe = (spec1: VersionSpec, spec2: VersionSpec) =>
  // not a valid range to compare (e.g. github url)
  semver.validRange(spec1) &&
  semver.validRange(spec2) &&
  // otherwise return true if spec2 is smaller than spec1
  semver.gt(semver.minVersion(spec1)!, semver.minVersion(spec2)!)

/**
 * Get the current dependencies from the package file.
 *
 * @param [pkgData={}] Object with dependencies, devDependencies, peerDependencies, optionalDependencies, and/or bundleDependencies properties
 * @param [options={}]
 * @param options.dep
 * @param options.filter
 * @param options.reject
 * @returns Promised {packageName: version} collection
 */
function getCurrentDependencies(pkgData: PackageFile = {}, options: Options = {}) {
  const depOptions = options.dep ? (options.dep || '').split(',') : ['dev', 'optional', 'peer', 'prod', 'bundle']

  // map the dependency section option to a full dependency section name
  const depSections = depOptions.map(
    short => (short === 'prod' ? 'dependencies' : short + 'Dependencies') as keyof PackageFile,
  )

  // get all dependencies from the selected sections
  // if a dependency appears in more than one section, take the lowest version number
  const allDependencies = depSections.reduce((accum, depSection) => {
    return {
      ...accum,
      ...filterObject(
        (pkgData[depSection] as Index<string>) || {},
        (dep, spec) => !isGreaterThanSafe(spec, accum[dep]),
      ),
    }
  }, {} as Index<VersionSpec>)

  // filter & reject dependencies and versions
  const workspacePackageMap = keyValueBy(options.workspacePackages || [])
  const filteredDependencies = filterObject(
    filterObject(allDependencies, name => !workspacePackageMap[name]),
    filterAndReject(
      options.filter || null,
      options.reject || null,
      options.filterVersion || null,
      options.rejectVersion || null,
    ),
  )

  return filteredDependencies
}

export default getCurrentDependencies
