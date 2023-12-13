import * as semver from 'semver'
import { Index } from '../types/IndexType.js'
import { Options } from '../types/Options.js'
import { PackageFile } from '../types/PackageFile.js'
import { VersionSpec } from '../types/VersionSpec.js'
import filterAndReject from './filterAndReject.js'
import filterObject from './filterObject.js'
import { keyValueBy } from './keyValueBy.js'
import resolveDepSections from './resolveDepSections.js'

/** Returns true if spec1 is greater than spec2, ignoring invalid version ranges. */
const isGreaterThanSafe = (spec1: VersionSpec, spec2: VersionSpec) =>
  // not a valid range to compare (e.g. github url)
  semver.validRange(spec1) &&
  semver.validRange(spec2) &&
  // otherwise return true if spec2 is smaller than spec1
  semver.gt(semver.minVersion(spec1)!, semver.minVersion(spec2)!)

/** Parses the packageManager field into a { [name]: version } pair. */
const parsePackageManager = (pkgData: PackageFile) => {
  if (!pkgData.packageManager) return {}
  const [name, version] = pkgData.packageManager.split('@')
  return { [name]: version }
}
/**
 * Get the current dependencies from the package file.
 *
 * @param [pkgData={}] Object with dependencies, devDependencies, peerDependencies, and/or optionalDependencies properties.
 * @param [options={}]
 * @param options.dep
 * @param options.filter
 * @param options.reject
 * @returns Promised {packageName: version} collection
 */
function getCurrentDependencies(pkgData: PackageFile = {}, options: Options = {}) {
  const depSections = resolveDepSections(options.dep)

  // get all dependencies from the selected sections
  // if a dependency appears in more than one section, take the lowest version number
  const allDependencies = depSections.reduce((accum, depSection) => {
    return {
      ...accum,
      ...(depSection === 'packageManager'
        ? parsePackageManager(pkgData)
        : filterObject(
            (pkgData[depSection] as Index<string>) || {},
            (dep, spec) => !isGreaterThanSafe(spec, accum[dep]),
          )),
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
