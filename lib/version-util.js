'use strict'

const util = require('util')
const semverutils = require('semver-utils')
const _ = require('lodash')
const chalk = require('chalk')
const cint = require('cint')
const semver = require('semver')
const parseGithubUrl = require('parse-github-url')

const VERSION_BASE_PARTS = ['major', 'minor', 'patch']
const VERSION_ADDED_PARTS = ['release', 'build']
const VERSION_PARTS = [].concat(VERSION_BASE_PARTS, VERSION_ADDED_PARTS)
const VERSION_PART_DELIM = {
  major: '',
  minor: '.',
  patch: '.',
  release: '-',
  build: '+'
}
const DEFAULT_WILDCARD = '^'
const WILDCARDS = ['^', '~', '.*', '.x']
const WILDCARDS_PURE = ['^', '~', '^*', '*', 'x', 'x.x', 'x.x.x']
const WILDCARD_PURE_REGEX = new RegExp(`^(${WILDCARDS_PURE.join('|')
  .replace(/\^/g, '\\^')
  .replace(/\*/g, '\\*')})$`)

/** Matches an npm alias version declaration. */
const NPM_ALIAS_REGEX = /^npm:(.*)@(.*)/

/**
 * @param version
 * @returns The number of parts in the version
 */
function numParts(version) {

  const [semver] = semverutils.parseRange(version)

  if (!semver) {
    throw new Error(util.format('semverutils.parseRange returned null when trying to parse "%s". This is probably a problem with the "semver-utils" dependency. Please report an issue at https://github.com/raineorshine/npm-check-updates/issues.', version))
  }

  return _.intersection(VERSION_PARTS, Object.keys(semver)).length
}

/**
 * Increases or decreases the given precision by the given amount, e.g. major+1 -> minor
 *
 * @param precision
 * @param n
 * @returns
 */
function precisionAdd(precision, n) {

  if (n === 0) {
    return precision
  }

  const index = n === 0 ? precision :
    VERSION_BASE_PARTS.includes(precision) ? VERSION_BASE_PARTS.indexOf(precision) + n :
    VERSION_ADDED_PARTS.includes(precision) ? VERSION_BASE_PARTS.length + n :
    null

  if (index === null) {
    throw new Error(`Invalid precision: ${precision}`)
  }
  if (!VERSION_PARTS[index]) {
    throw new Error(`Invalid precision math${arguments}`)
  }

  return VERSION_PARTS[index]
}

/**
 * Joins the major, minor, patch, release, and build parts (controlled by an
 * optional precision arg) of a semver object into a dot-delimited string.
 *
 * @param semver
 * @param [precision]
 * @returns
 */
function stringify(semver, precision) {

  // get a list of the parts up until (and including) the given precision
  // or all of them, if no precision is specified
  const parts = precision ? VERSION_PARTS.slice(0, VERSION_PARTS.indexOf(precision) + 1) : VERSION_PARTS

  // pair each part with its delimiter and join together
  return parts
    .filter(part => VERSION_BASE_PARTS.includes(precision) || semver[part])
    .map(part => VERSION_PART_DELIM[part] + (semver[part] || '0'))
    .join('')
}

/**
 * Gets how precise this version number is (major, minor, patch, release, or build)
 *
 * @param version
 * @returns
 */
function getPrecision(version) {
  const [semver] = semverutils.parseRange(version)
  // expects VERSION_PARTS to be in correct order
  // eslint-disable-next-line fp/no-mutating-methods
  return VERSION_PARTS.slice().reverse().find(_.propertyOf(semver))
}

/**
 * Sets the precision of a (loose) semver to the specified level: major, minor, etc.
 *
 * @param version
 * @param [precision]
 * @returns
 */
function setPrecision(version, precision) {
  const [semver] = semverutils.parseRange(version)
  return stringify(semver, precision)
}

/**
 * Adds a given wildcard (^,~,.*,.x) to a version number. Adds ^ and ~ to the
 * beginning. Replaces everything after the major version number with .* or .x
 *
 * @param version
 * @param wildcard
 * @returns
 */
function addWildCard(version, wildcard) {
  return wildcard === '^' || wildcard === '~' ?
    wildcard + version :
    setPrecision(version, 'major') + wildcard
}

/**
 * Returns true if the given string is one of the wild cards.
 *
 * @param version
 * @returns
 */
function isWildCard(version) {
  return WILDCARD_PURE_REGEX.test(version)
}

/**
 * Returns true if the given digit is a wildcard for a part of a version.
 *
 * @param versionPart
 * @returns
 */
function isWildPart(versionPart) {
  return versionPart === '*' || versionPart === 'x'
}

/**
 * Colorize the parts of a version string (to) that are different than
 * another (from). Assumes that the two verson strings are in the same format.
 *
 * @param from
 * @param to
 * @returns
 */
function colorizeDiff(from, to) {
  let leadingWildcard = ''

  // separate out leading ^ or ~
  if (/^[~^]/.test(to) && to[0] === from[0]) {
    leadingWildcard = to[0]
    to = to.slice(1)
    from = from.slice(1)
  }

  // split into parts
  const partsToColor = to.split('.')
  const partsToCompare = from.split('.')

  let i = partsToColor.findIndex((part, i) => part !== partsToCompare[i])
  i = i >= 0 ? i : partsToColor.length

  // major = red (or any change before 1.0.0)
  // minor = cyan
  // patch = green
  const color = i === 0 || partsToColor[0] === '0' ? 'red' :
    i === 1 ? 'cyan' :
    'green'

  // if we are colorizing only part of the word, add a dot in the middle
  const middot = i > 0 && i < partsToColor.length ? '.' : ''

  return leadingWildcard +
        partsToColor.slice(0, i).join('.') +
        middot +
        chalk[color](partsToColor.slice(i).join('.'))
}

/**
 * Finds the greatest version at the given level (minor|patch).
 *
 * @param versions  Unsorted array of all available versions
 * @param current   Current version or range
 * @param level     minor|patch
 * @returns         String representation of the suggested version.
 */
function findGreatestByLevel(versions, current, level) {

  if (!semver.validRange(current)) {
    return null
  }

  const cur = semver.minVersion(current)
  const versionsSorted = [...versions] // eslint-disable-line fp/no-mutating-methods
    .sort(compareVersions)
    .filter(v => {
      const parsed = semver.parse(v)
      return (level === 'major' || parsed.major === cur.major) &&
        (level === 'major' || level === 'minor' || parsed.minor === cur.minor)
    })

  return _.last(versionsSorted)
}

/** Comparator used to sort semver versions */
function compareVersions(a, b) {
  return semver.gt(a, b) ? 1 : a === b ? 0 : -1
}

/**
 * @param version
 * @returns True if the version is any kind of prerelease: alpha, beta, rc, pre
 */
function isPre(version) {
  return getPrecision(version) === 'release'
}

/** Checks if a string is a simple version in the format "v1". */
const isSimpleVersion = s => /^[vV]\d+$/.test(s)

/**
 * Returns 'v' if the string starts with a v, otherwise returns empty string.
 *
 * @param str
 * @returns
 */
function v(str) {
  return str && (str[0] === 'v' || str[1] === 'v') ? 'v' : ''
}

/**
 * Constructs an npm alias from the name and version of the actual package.
 *
 * @param name Name of the actual package.
 * @param version Version of the actual package.
 * @returns    "npm:package@x.y.z"
 * @example    createNpmAlias('chalk', '2.0.0') -> 'npm:chalk@2.0.0'
 */
const createNpmAlias = (name, version) => `npm:${name}@${version}`

/**
 * Parses an npm alias into a [name, version] 2-tuple.
 *
 * @returns  [name, version] or null if the input is not an npm alias
 * @example  'npm:chalk@1.0.0' -> ['chalk', '1.0.0']
 */
const parseNpmAlias = alias => {
  const match = alias && alias.match(NPM_ALIAS_REGEX)
  return match && match.slice(1)
}

/**
 * Returns true if a version declaration is an npm alias.
 */
const isNpmAlias = declaration =>
  declaration && !!declaration.match(NPM_ALIAS_REGEX)

/**
 * Replaces the version number embedded in an npm alias.
 */
const upgradeNpmAlias = (declaration, upgraded) =>
  createNpmAlias(parseNpmAlias(declaration)[0], upgraded)

/**
 * Returns true if a version declaration is a Github URL with a valid semver version.
 */
const isGithubUrl = declaration => {
  if (!declaration) return false
  const parsed = parseGithubUrl(declaration)
  if (!parsed || !parsed.branch) return false

  const version = decodeURIComponent(parsed.branch)
    .replace(/^semver:/, '')
  return !!semver.validRange(version)
}

/**
 * Returns the embedded tag in a Github URL.
 */
const getGithubUrlTag = declaration => {
  if (!declaration) return null
  const parsed = parseGithubUrl(declaration)
  if (!parsed || !parsed.branch) return null
  const version = decodeURIComponent(parsed.branch)
    .replace(/^semver:/, '')
  return parsed && parsed.branch && semver.validRange(version) ? version : null
}

/**
 * Upgrade an existing dependency declaration to satisfy the latest version.
 *
 * @param declaration Current version declaration (e.g. "1.2.x")
 * @param latestVersion Latest version (e.g "1.3.2")
 * @param [options={}]
 * @returns The upgraded dependency declaration (e.g. "1.3.x")
 */
function upgradeDependencyDeclaration(declaration, latestVersion, options = {}) {
  options.wildcard = options.wildcard || DEFAULT_WILDCARD

  // parse the latestVersion
  // return original declaration if latestSemver is invalid
  const [latestSemver] = semverutils.parseRange(latestVersion)
  if (!latestSemver) {
    return declaration
  }

  // return global wildcards immediately
  if (options.removeRange) {
    return latestVersion
  }
  else if (isWildCard(declaration)) {
    return declaration
  }

  // parse the declaration
  // if multiple ranges, use the semver with the least number of parts
  const parsedRange = _(semverutils.parseRange(declaration))
  // semver-utils includes empty entries for the || and - operators. We can remove them completely
    .reject({ operator: '||' })
    .reject({ operator: '-' })
    .sortBy(_.ary(_.flow(stringify, numParts), 1))
    .value()
  const [declaredSemver] = parsedRange

  /**
   * Chooses version parts between the declared version and the latest.
   * Base parts (major, minor, patch) are only included if they are in the original declaration.
   * Added parts (release, build) are always included. They are only present if we are checking --greatest versions
   * anyway.
   */
  function chooseVersion(part) {
    return isWildPart(declaredSemver[part]) ? declaredSemver[part] :
      VERSION_BASE_PARTS.includes(part) && declaredSemver[part] ? latestSemver[part] :
      VERSION_ADDED_PARTS.includes(part) ? latestSemver[part] :
      undefined
  }

  // create a new semver object with major, minor, patch, build, and release parts
  const newSemver = cint.toObject(VERSION_PARTS, part => ({
    [part]: chooseVersion(part)
  }))
  const newSemverString = stringify(newSemver)
  const version = v(declaredSemver.semver) + newSemverString

  // determine the operator
  // do not compact, because [undefined, '<'] must be differentiated from ['<']
  const uniqueOperators = _(parsedRange)
    .map(range => range.operator)
    .uniq()
    .value()
  const operator = uniqueOperators[0] || ''

  const hasWildCard = WILDCARDS.some(wildcard => newSemverString.includes(wildcard))
  const isLessThan = uniqueOperators[0] === '<' || uniqueOperators[0] === '<='
  const isMixed = uniqueOperators.length > 1

  // convert versions with </<= or mixed operators into the preferred wildcard
  // only do so if the new version does not already contain a wildcard
  return !hasWildCard && (isLessThan || isMixed) ?
    addWildCard(version, options.wildcard) :
    operator + version
}

/**
 * Replaces the version number embedded in a Github URL.
 */
const upgradeGithubUrl = (declaration, upgraded) => {
  const tag = decodeURIComponent(parseGithubUrl(declaration).branch)
    .replace(/^semver:/, '')
  // if the tag does not start with "v", remove it from upgraded
  const upgradedNormalized = !tag.startsWith('v') && upgraded.startsWith('v')
    ? upgraded.slice(1)
    : upgraded
  const upgradedWithSimpleStripped = isSimpleVersion(tag)
    ? upgradedNormalized.replace('.0.0', '')
    : upgradedNormalized
  return declaration.replace(tag, upgradeDependencyDeclaration(tag, upgradedWithSimpleStripped))
}

module.exports = {
  compareVersions,
  numParts,
  stringify,
  precisionAdd,
  getPrecision,
  setPrecision,
  addWildCard,
  isPre,
  isSimpleVersion,
  isWildCard,
  isWildPart,
  colorizeDiff,
  findGreatestByLevel,
  isNpmAlias,
  createNpmAlias,
  parseNpmAlias,
  upgradeNpmAlias,
  isGithubUrl,
  getGithubUrlTag,
  upgradeDependencyDeclaration,
  upgradeGithubUrl,
  DEFAULT_WILDCARD,
  VERSION_BASE_PARTS,
  VERSION_ADDED_PARTS,
  VERSION_PARTS,
  WILDCARDS,
}
