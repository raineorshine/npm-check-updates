import semver from 'semver'
import cint from 'cint'
import prompts from 'prompts'
import * as versionUtil from './version-util'
import filterAndReject from './lib/filterAndReject'
import getPackageManager from './lib/getPackageManager'
import { Index, Options, PackageFile, Version, VersionDeclaration } from './types'

/**
 * @returns String safe for use in `new RegExp()`
 */
function escapeRegexp(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') // Thanks Stack Overflow!
}

/**
 * Return a promise which resolves to object storing package owner changed status for each dependency.
 *
 * @param fromVersion current packages version.
 * @param toVersion target packages version.
 * @param options
 * @returns
 */
export async function getOwnerPerDependency(fromVersion: Index<Version>, toVersion: Index<Version>, options: Options) {
  const packageManager = getPackageManager(options.packageManager)
  return await Object.keys(toVersion).reduce(async (accum, dep) => {
    const from = fromVersion[dep] || null
    const to = toVersion[dep] || null
    const ownerChanged = await packageManager.packageAuthorChanged!(dep, from!, to!, options)
    return {
      ...accum,
      [dep]: ownerChanged,
    }
  }, {} as Promise<Index<boolean>>)
}

/**
 * Upgrade the dependency declarations in the package data.
 *
 * @param pkgData The package.json data, as utf8 text
 * @param oldDependencies Old dependencies {package: range}
 * @param newDependencies New dependencies {package: range}
 * @param newVersions New versions {package: version}
 * @param [options={}]
 * @returns The updated package data, as utf8 text
 * @description Side Effect: prompts
 */
export async function upgradePackageData(pkgData: string, oldDependencies: Index<VersionDeclaration>, newDependencies: Index<VersionDeclaration>, newVersions: Index<Version>, options: Options = {}) {

  // copy newDependencies for mutation via interactive mode
  const selectedNewDependencies = { ...newDependencies }
  let newPkgData = pkgData

  // eslint-disable-next-line fp/no-loops
  for (const dependency in newDependencies) {
    if (!options.minimal || !semver.satisfies(newVersions[dependency], oldDependencies[dependency])) {
      if (options.interactive) {
        const to = versionUtil.colorizeDiff(oldDependencies[dependency], newDependencies[dependency] || '')
        const response = await prompts({
          type: 'confirm',
          name: 'value',
          message: `Do you want to upgrade: ${dependency} ${oldDependencies[dependency]} → ${to}?`,
          initial: true,
          onState: state => {
            if (state.aborted) {
              process.nextTick(() => process.exit(1))
            }
          }
        })
        if (!response.value) {
          // continue loop to next dependency and skip updating newPkgData
          delete selectedNewDependencies[dependency] // eslint-disable-line fp/no-delete
          continue
        }
      }
      const expression = `"${dependency}"\\s*:\\s*"${escapeRegexp(`${oldDependencies[dependency]}"`)}`
      const regExp = new RegExp(expression, 'g')
      newPkgData = newPkgData.replace(regExp, `"${dependency}": "${newDependencies[dependency]}"`)

    }
  }

  return { newPkgData, selectedNewDependencies }
}

/** Returns true if spec1 is greater than spec2, ignoring invalid version ranges. */
const isGreaterThanSafe = (spec1: VersionDeclaration, spec2: VersionDeclaration) =>
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
export function getCurrentDependencies(pkgData: PackageFile = {}, options: Options = {}) {

  const depOptions = options.dep
    ? (options.dep || '').split(',')
    : ['dev', 'optional', 'peer', 'prod', 'bundle']

  // map the dependency section option to a full dependency section name
  const depSections = depOptions.map(short =>
    (short === 'prod' ? 'dependencies' : short + 'Dependencies') as keyof PackageFile
  )

  // get all dependencies from the selected sections
  // if a dependency appears in more than one section, take the lowest version number
  const allDependencies = depSections.reduce((accum, depSection) => {
    return {
      ...accum,
      ...cint.filterObject(pkgData[depSection], (dep, spec) => !isGreaterThanSafe(spec, accum[dep]))
    }
  }, {} as Index<VersionDeclaration>)

  // filter & reject dependencies and versions
  const filteredDependencies = cint.filterObject(
    allDependencies,
    filterAndReject(
      options.filter || null,
      options.reject || null,
      options.filterVersion || null,
      options.rejectVersion || null
    )
  )

  return filteredDependencies
}

//
// API
//

module.exports = {
  // used directly by cli.js
  getCurrentDependencies,
  upgradePackageData,
  getOwnerPerDependency,
}
