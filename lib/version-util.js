'use strict'

const util = require('util')
const semverutils = require('semver-utils')
const _ = require('lodash')
const chalk = require('chalk')
const semver = require('semver')

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
const WILDCARDS = ['^', '~', '.*', '.x']
const WILDCARDS_PURE = ['^', '~', '^*', '*', 'x', 'x.x', 'x.x.x']
const WILDCARD_PURE_REGEX = new RegExp(`^(${WILDCARDS_PURE.join('|')
  .replace(/\^/g, '\\^')
  .replace(/\*/g, '\\*')})$`)

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
 * Finds the greatest version under the given level (major|minor).
 *
 * @param versions  Array of all available versions
 * @param current   Current version or range
 * @param level     major|minor
 * @returns         String representation of the suggested version.
 */
function findGreatestByLevel(versions, current, level) {

  if (!semver.validRange(current)) {
    return null
  }

  const cur = semver.minVersion(current)
  const greatestVersion = versions
    .map(v => ({
      string: v,
      parsed: semver.parse(v)
    }))
    .filter(o => {
      // major part must match
      // minor part must match if level is minor
      return o.parsed.major === cur.major &&
                (level === 'major' || o.parsed.minor === cur.minor)
    })
    .map(o => o.string)

  return greatestVersion[greatestVersion.length - 1]
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

module.exports = {
  compareVersions,
  numParts,
  stringify,
  precisionAdd,
  getPrecision,
  setPrecision,
  addWildCard,
  isPre,
  isWildCard,
  isWildPart,
  colorizeDiff,
  findGreatestByLevel,
  VERSION_BASE_PARTS,
  VERSION_ADDED_PARTS,
  VERSION_PARTS,
  WILDCARDS
}
