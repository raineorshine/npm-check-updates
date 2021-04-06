'use strict'

const semver = require('semver')
const _ = require('lodash')
const cint = require('cint')
const chalk = require('chalk')
const minimatch = require('minimatch')
const semverutils = require('semver-utils')
const ProgressBar = require('progress')
const prompts = require('prompts')
const pMap = require('p-map')
const { and } = require('fp-and-or')
const versionUtil = require('./version-util')
const packageManagers = require('./package-managers')
const { supportedVersionTargets } = require('./constants')

/**
 * Upgrade a dependencies collection based on latest available versions. Supports npm aliases.
 *
 * @param currentDependencies current dependencies collection object
 * @param latestVersions latest available versions collection object
 * @param [options={}]
 * @returns upgraded dependency collection object
 */
function upgradeDependencies(currentDependencies, latestVersions, options = {}) {
  // filter out dependencies with empty values
  currentDependencies = cint.filterObject(currentDependencies, (key, value) => value)

  // get the preferred wildcard and bind it to upgradeDependencyDeclaration
  const wildcard = getPreferredWildcard(currentDependencies) || versionUtil.DEFAULT_WILDCARD
  const upgradeDep = (current, latest) => versionUtil.upgradeDependencyDeclaration(current, latest, {
    wildcard,
    removeRange: options.removeRange
  })

  return _(currentDependencies)
    // only include packages for which a latest version was fetched
    .pickBy((current, packageName) => packageName in latestVersions)
    // unpack npm alias and git urls
    .mapValues((current, packageName) => {
      const latest = latestVersions[packageName]
      let currentParsed = null
      let latestParsed = null

      // parse npm alias
      if (versionUtil.isNpmAlias(current)) {
        currentParsed = versionUtil.parseNpmAlias(current)[1]
        latestParsed = versionUtil.parseNpmAlias(latest)[1]
      }

      // "branch" is also used for tags (refers to everything after the hash character)
      if (versionUtil.isGithubUrl(current)) {

        const currentTag = versionUtil.getGithubUrlTag(current)
        const [currentSemver] = semverutils.parseRange(currentTag)
        currentParsed = versionUtil.stringify(currentSemver)

        const latestTag = versionUtil.getGithubUrlTag(latest)
        const [latestSemver] = semverutils.parseRange(latestTag)
        latestParsed = versionUtil.stringify(latestSemver)
      }

      return { current, currentParsed, latest, latestParsed }
    })
    // pick the packages that are upgradeable
    .pickBy(({ current, currentParsed, latest, latestParsed }) => isUpgradeable(currentParsed || current, latestParsed || latest))
    // pack embedded versions: npm aliases and git urls
    .mapValues(({ current, currentParsed, latest, latestParsed }) => {
      const upgraded = upgradeDep(currentParsed || current, latestParsed || latest)
      return versionUtil.isNpmAlias(current) ? versionUtil.upgradeNpmAlias(current, upgraded)
        : versionUtil.isGithubUrl(current) ? versionUtil.upgradeGithubUrl(current, upgraded)
        : upgraded
    })
    .value()
}

// Determines if the given version (range) should be upgraded to the latest (i.e. it is valid, it does not currently

/**
 * Return true if the version satisfies the range.
 *
 * @type {Function}
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
const isSatisfied = semver.satisfies

/**
 * Check if a version satisfies the latest, and is not beyond the latest). Ignores `v` prefix.
 *
 * @param current
 * @param latest
 * @returns
 */
function isUpgradeable(current, latest) {

  // do not upgrade non-npm version declarations (such as git tags)
  // do not upgrade versionUtil.wildcards
  if (!semver.validRange(current) || versionUtil.isWildCard(current)) {
    return false
  }

  // remove the constraint (e.g. ^1.0.1 -> 1.0.1) to allow upgrades that satisfy the range, but are out of date
  const [range] = semverutils.parseRange(current)
  if (!range) {
    throw new Error(`"${current}" could not be parsed by semver-utils. This is probably a bug. Please file an issue at https://github.com/raineorshine/npm-check-updates.`)
  }

  const version = versionUtil.stringify(range)
  const latestNormalized = versionUtil.isSimpleVersion(latest)
    ? latest.replace('v', '') + '.0.0'
    : latest

  // make sure it is a valid range
  // not upgradeable if the latest version satisfies the current range
  // not upgradeable if the specified version is newer than the latest (indicating a prerelease version)
  // NOTE: When "<" is specified with a single digit version, e.g. "<7", and has the same major version as the latest, e.g. "7", isSatisfied(latest, version) will return true since it ignores the "<". In this case, test the original range (current) rather than the versionUtil output (version).
  return Boolean(semver.validRange(version)) &&
        !isSatisfied(latestNormalized, range.operator === '<' ? current : version) &&
        !semver.ltr(latestNormalized, version)
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
function composeFilter(filterPattern) {

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
      predicate = s => regexp.test(s)
    }
    // glob string
    else {
      const patterns = filterPattern.split(/[\s,]+/)
      predicate = s => patterns.some(pattern => minimatch(s, pattern))
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    predicate = s => filterPattern.some(subpattern => composeFilter(subpattern)(s))
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = s => filterPattern.test(s)
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
function filterAndReject(filter, reject, filterVersion, rejectVersion) {
  return and(
    // filter dep
    (dep, version) => and(
      filter ? composeFilter(filter) : _.identity,
      reject ? _.negate(composeFilter(reject)) : _.identity
    )(dep),
    // filter version
    (dep, version) => and(
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
async function getOwnerPerDependency(fromVersion, toVersion, options) {
  const packageManager = getPackageManager(options.packageManager)
  return await Object.keys(toVersion).reduce(async (accum, dep) => {
    const from = fromVersion[dep] || null
    const to = toVersion[dep] || null
    const ownerChanged = await packageManager.packageAuthorChanged(dep, from, to, options)
    return {
      ...accum,
      [dep]: ownerChanged,
    }
  }, {})
}

/**
 * Returns an 2-tuple of upgradedDependencies and their latest versions.
 *
 * @param currentDependencies
 * @param options
 * @returns
 */
async function upgradePackageDefinitions(currentDependencies, options) {
  const latestVersions = await queryVersions(currentDependencies, options)

  const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, {
    removeRange: options.removeRange
  })

  const filteredUpgradedDependencies = _.pickBy(upgradedDependencies, (v, dep) => {
    return !options.jsonUpgraded || !options.minimal || !isSatisfied(latestVersions[dep], currentDependencies[dep])
  })

  return [filteredUpgradedDependencies, latestVersions]
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
async function upgradePackageData(pkgData, oldDependencies, newDependencies, newVersions, options = {}) {

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
function getCurrentDependencies(pkgData = {}, options = {}) {

  const deps = options.dep
    ? (options.dep || '').split(',')
    : ['dev', 'optional', 'peer', 'prod', 'bundle']

  const allDependencies = cint.filterObject(
    {
      ...deps.includes('prod') && pkgData.dependencies,
      ...deps.includes('dev') && pkgData.devDependencies,
      ...deps.includes('peer') && pkgData.peerDependencies,
      ...deps.includes('optional') && pkgData.optionalDependencies,
      ...deps.includes('bundle') && pkgData.bundleDependencies
    },
    filterAndReject(options.filter, options.reject, options.filterVersion, options.rejectVersion)
  )

  return allDependencies
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
async function getInstalledPackages(options = {}) {

  const pkgInfoObj = await getPackageManager(options.packageManager)
    .list({ cwd: options.cwd, prefix: options.prefix, global: options.global })

  if (!pkgInfoObj) {
    throw new Error('Unable to retrieve NPM package list')
  }

  // filter out undefined packages or those with a wildcard
  const filterFunction = filterAndReject(options.filter, options.reject, options.filterVersion, options.rejectVersion)
  return cint.filterObject(pkgInfoObj, (dep, version) =>
    version && !versionUtil.isWildPart(version) && filterFunction(dep, version)
  )

}

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are current versions. May include npm aliases, i.e. { "package": "npm:other-package@1.0.0" }
 * @param [options={}] Options. Default: { target: 'latest' }.
 * @returns Promised {packageName: version} collection
 */
async function queryVersions(packageMap, options = {}) {

  const target = options.target || 'latest'
  const packageList = Object.keys(packageMap)
  const packageManager = getPackageManager(options.packageManager)

  let bar
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && packageList.length > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: packageList.length, width: 20 })
    bar.render()
  }

  // set the getPackageVersion function from options.target
  const getPackageVersion = packageManager[target]
  if (!getPackageVersion) {
    const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
    return Promise.reject(new Error(`Unsupported target "${target}" for ${options.packageManager || 'npm'}. Supported version targets are: ${packageManagerSupportedVersionTargets.join(', ')}`))
  }

  /**
   * Ignore 404 errors from getPackageVersion by having them return `null`
   * instead of rejecting.
   *
   * @param dep
   * @returns
   */
  async function getPackageVersionProtected(dep) {

    const npmAlias = versionUtil.parseNpmAlias(packageMap[dep])
    const [name, version] = npmAlias || [dep, packageMap[dep]]

    let versionNew = null

    // use gitTags package manager for git urls
    if (versionUtil.isGithubUrl(packageMap[dep])) {

      // override packageManager and getPackageVersion just for this dependency
      const packageManager = packageManagers.gitTags
      const getPackageVersion = packageManager[target]

      if (!getPackageVersion) {
        const packageManagerSupportedVersionTargets = supportedVersionTargets.filter(t => t in packageManager)
        return Promise.reject(new Error(`Unsupported target "${target}" for github urls. Supported version targets are: ${packageManagerSupportedVersionTargets.join(', ')}`))
      }
      versionNew = await getPackageVersion(name, version, {
        ...options,
        // upgrade prereleases to newer prereleases by default
        pre: options.pre != null ? options.pre : versionUtil.isPre(version),
      })
    }
    else {
      try {
        versionNew = await getPackageVersion(name, version, {
          ...options,
          // upgrade prereleases to newer prereleases by default
          pre: options.pre != null ? options.pre : versionUtil.isPre(version),
        })
        versionNew = npmAlias ? versionUtil.createNpmAlias(name, versionNew) : versionNew
      }
      catch (err) {
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
  const zipVersions = versionList =>
    cint.toObject(versionList, (version, i) => ({
      [packageList[i]]: version
    }))

  const versions = await pMap(packageList, getPackageVersionProtected, { concurrency: options.concurrency })

  return _.pickBy(zipVersions(versions), _.identity)
}

/**
 *
 * @param dependencies A dependencies collection
 * @returns Returns whether the user prefers ^, ~, .*, or .x
 * (simply counts the greatest number of occurrences) or `null` if
 * given no dependencies.
 */
function getPreferredWildcard(dependencies) {

  // if there are no dependencies, return null.
  if (Object.keys(dependencies).length === 0) {
    return null
  }

  // group the dependencies by wildcard
  const groups = _.groupBy(Object.values(dependencies), dep =>
    versionUtil.WILDCARDS.find(wildcard =>
      dep && dep.includes(wildcard)
    )
  )

  delete groups.undefined // eslint-disable-line fp/no-delete

  // convert to an array of objects that can be sorted
  const arrOfGroups = cint.toArray(groups, (wildcard, instances) => ({
    wildcard,
    instances
  }))

  // reverse sort the groups so that the wildcard with the most appearances is at the head, then return it.
  const sorted = _.sortBy(arrOfGroups, wildcardObject => -wildcardObject.instances.length)

  return sorted.length > 0 ? sorted[0].wildcard : null
}

/**
 * Initialize the version manager with the given package manager.
 *
 * @param packageManagerNameOrObject
 * @param packageManagerNameOrObject.global
 * @param packageManagerNameOrObject.packageManager
 * @returns
 */
function getPackageManager(packageManagerNameOrObject) {

  /** Get one of the preset package managers or throw an error if there is no match. */
  function getPresetPackageManager(packageManagerName) {
    if (!(packageManagerName in packageManagers)) {
      throw new Error(`Invalid package manager: ${packageManagerName}`)
    }
    return packageManagers[packageManagerName]
  }

  return !packageManagerNameOrObject ? packageManagers.npm : // default to npm
  // use present package manager if name is specified
    typeof packageManagerNameOrObject === 'string' ? getPresetPackageManager(packageManagerNameOrObject) :
    // use provided package manager object otherwise
    packageManagerNameOrObject
}

//
// Helper functions
//

/**
 * @param s
 * @returns String safe for use in `new RegExp()`
 */
function escapeRegexp(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') // Thanks Stack Overflow!
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
  getPreferredWildcard,
  isUpgradeable,
  queryVersions,
  upgradeDependencies,
  getPackageManager,
}
