import semver from 'semver'
import _ from 'lodash'
import cint from 'cint'
import chalk from 'chalk'
import minimatch from 'minimatch'
import semverutils from 'semver-utils'
import ProgressBar from 'progress'
import prompts from 'prompts'
import { and } from 'fp-and-or'
import * as versionUtil from './version-util'
import getPreferredWildcard from './lib/getPreferredWildcard'
import isUpgradeable from './lib/isUpgradeable'
import queryVersions from './lib/queryVersions'
import getPackageManager from './lib/getPackageManager'
import upgradeDependencies from './lib/upgradeDependencies'
import getPeerDependenciesFromRegistry from './lib/getPeerDependenciesFromRegistry'
import { FilterPattern, GetVersion, IgnoredUpgrade, Index, Maybe, Options, PackageManager, PackageFile, Version, VersionDeclaration } from './types'

/**
 * Return true if the version satisfies the range.
 *
 * @type {Function}
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
export const isSatisfied = semver.satisfies

/** Returns a string that is safe to use in `new RegExp(...)`. */
function escapeRegexp(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') // Thanks Stack Overflow!
}

/**
 * @typedef {string|string[]|RegExp} FilterObject
 */

/**
 * Creates a filter function from a given filter string. Supports
 * strings, wildcards, comma-or-space-delimited lists, and regexes.
 *
 * @param [filter]
 * @returns
 */
function composeFilter(filterPattern: FilterPattern): (s: string) => boolean {

  let predicate

  // no filter
  if (!filterPattern) {
    predicate = _.identity
  }
  // string
  else if (typeof filterPattern === 'string') {
    // RegExp string
    if (filterPattern[0] === '/' && filterPattern[filterPattern.length - 1] === '/') {
      const regexp = new RegExp(filterPattern.slice(1, -1))
      predicate = (s: string) => regexp.test(s)
    }
    // glob string
    else {
      const patterns = filterPattern.split(/[\s,]+/)
      predicate = (s: string) => patterns.some(pattern => minimatch(s, pattern))
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    predicate = (s: string) => filterPattern.some(
      (subpattern: string | RegExp) => composeFilter(subpattern)(s)
    )
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (s: string) => filterPattern.test(s)
  }
  else {
    throw new TypeError('Invalid filter. Must be a RegExp, array, or comma-or-space-delimited list.')
  }

  // limit the arity to 1 to avoid passing the value
  return predicate
}

/**
 * Composes a filter function from filter, reject, filterVersion, and rejectVersion patterns.
 *
 * @param filter
 * @param reject
 * @param filterVersion
 * @param rejectVersion
 */
function filterAndReject(filter: Maybe<FilterPattern>, reject: Maybe<FilterPattern>, filterVersion: Maybe<FilterPattern>, rejectVersion: Maybe<FilterPattern>) {
  return and(
    // filter dep
    (dep: VersionDeclaration) => and(
      filter ? composeFilter(filter) : _.identity,
      reject ? _.negate(composeFilter(reject)) : _.identity
    )(dep),
    // filter version
    (dep: VersionDeclaration, version: Version) => and(
      filterVersion ? composeFilter(filterVersion) : _.identity,
      rejectVersion ? _.negate(composeFilter(rejectVersion)) : _.identity
    )(version)
  )
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
 * Returns an 3-tuple of upgradedDependencies, their latest versions and the resulting peer dependencies.
 *
 * @param currentDependencies
 * @param options
 * @returns
 */
export async function upgradePackageDefinitions(currentDependencies: Index<VersionDeclaration>, options: Options): Promise<[Index<VersionDeclaration>, Index<VersionDeclaration>, Index<Index<VersionDeclaration>>?]> {
  const latestVersions = await queryVersions(currentDependencies, options)

  const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, {
    removeRange: options.removeRange
  })

  const filteredUpgradedDependencies = _.pickBy(upgradedDependencies, (v, dep) => {
    return !options.jsonUpgraded || !options.minimal || !isSatisfied(latestVersions[dep], currentDependencies[dep])
  })

  if (options.peer && !_.isEmpty(filteredUpgradedDependencies)) {
    const upgradedPeerDependencies = await getPeerDependenciesFromRegistry(filteredUpgradedDependencies, options)
    const peerDependencies = { ...options.peerDependencies, ...upgradedPeerDependencies }
    if (!_.isEqual(options.peerDependencies, peerDependencies)) {
      const [newUpgradedDependencies, newLatestVersions, newPeerDependencies] = await upgradePackageDefinitions(
        { ...currentDependencies, ...filteredUpgradedDependencies },
        { ...options, peerDependencies, loglevel: 'silent' }
      )
      return [
        { ...filteredUpgradedDependencies, ...newUpgradedDependencies },
        { ...latestVersions, ...newLatestVersions },
        newPeerDependencies
      ]
    }
  }
  return [filteredUpgradedDependencies, latestVersions, options.peerDependencies]
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
    if (!options.minimal || !isSatisfied(newVersions[dependency], oldDependencies[dependency])) {
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
    // exclude peerDependencies
    // https://github.com/raineorshine/npm-check-updates/issues/951
    : ['dev', 'optional', 'prod', 'bundle']

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

/** Get all upgrades that are ignored due to incompatible peer dependencies. */
export async function getIgnoredUpgrades(current: Index<VersionDeclaration>, upgraded: Index<VersionDeclaration>, upgradedPeerDependencies: Index<Index<Version>>, options: Options = {}) {
  const [upgradedLatestVersions, latestVersions] = await upgradePackageDefinitions(
    current,
    { ...options, peer: false, peerDependencies: undefined, loglevel: 'silent' }
  )

  return Object.entries(upgradedLatestVersions)
    .filter(([pkgName, newVersion]) => upgraded[pkgName] !== newVersion)
    .reduce((accum, [pkgName, newVersion]) => ({
      ...accum,
      [pkgName]: {
        from: current[pkgName],
        to: newVersion,
        reason: Object.entries(upgradedPeerDependencies)
          .filter(([, peers]) => peers[pkgName] !== undefined && !semver.satisfies(latestVersions[pkgName], peers[pkgName]))
          .reduce((accumReason, [peerPkg, peers]) => ({ ...accumReason, [peerPkg]: peers[pkgName] }), {} as Index<string>)
      }
    }), {} as Index<IgnoredUpgrade>)
}

/**
 * @param [options]
 * @param options.cwd
 * @param options.filter
 * @param options.global
 * @param options.packageManager
 * @param options.prefix
 * @param options.reject
 */
export async function getInstalledPackages(options: Options = {}) {

  const pkgInfoObj = await getPackageManager(options.packageManager)
    .list?.({ cwd: options.cwd, prefix: options.prefix, global: options.global })

  if (!pkgInfoObj) {
    throw new Error('Unable to retrieve NPM package list')
  }

  // filter out undefined packages or those with a wildcard
  const filterFunction = filterAndReject(options.filter, options.reject, options.filterVersion, options.rejectVersion)
  return cint.filterObject(pkgInfoObj, (dep: VersionDeclaration, version: Version) =>
    !!version && !versionUtil.isWildPart(version) && filterFunction(dep, version)
  )

}

//
// API
//

module.exports = {
  // used directly by cli.js
  getCurrentDependencies,
  getInstalledPackages,
  isSatisfied,
  upgradePackageData,
  upgradePackageDefinitions,
  getOwnerPerDependency,

  // exposed for testing
  getIgnoredUpgrades,
}
