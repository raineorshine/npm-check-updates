import ary from 'lodash/ary'
import curry from 'lodash/curry'
import flow from 'lodash/flow'
import intersection from 'lodash/intersection'
import last from 'lodash/last'
import propertyOf from 'lodash/propertyOf'
import reject from 'lodash/reject'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'
import parseGithubUrl from 'parse-github-url'
import semver from 'semver'
import semverutils, { SemVer, parse, parseRange } from 'semver-utils'
import util from 'util'
import { Index } from '../types/IndexType.js'
import { Maybe } from '../types/Maybe.js'
import { Options } from '../types/Options.js'
import { UpgradeGroup } from '../types/UpgradeGroup.js'
import { VersionLevel } from '../types/VersionLevel.js'
import chalk from './chalk.js'
import { keyValueBy } from './keyValueBy.js'

type VersionPart = keyof SemVer

const VERSION_BASE_PARTS = ['major', 'minor', 'patch'] as VersionPart[]
const VERSION_ADDED_PARTS = ['release', 'build'] as VersionPart[]
const VERSION_PARTS = [...VERSION_BASE_PARTS, ...VERSION_ADDED_PARTS] as VersionPart[]
const VERSION_PART_DELIM: SemVer = {
  major: '',
  minor: '.',
  patch: '.',
  release: '-',
  build: '+',
}
export const DEFAULT_WILDCARD = '^'
export const WILDCARDS = ['^', '~', '.*', '.x']
const WILDCARDS_PURE = ['^', '~', '^*', '*', 'x', 'x.x', 'x.x.x']
const WILDCARD_PURE_REGEX = new RegExp(`^(${WILDCARDS_PURE.join('|').replace(/\^/g, '\\^').replace(/\*/g, '\\*')})$`)

/** Matches an npm alias version declaration. */
const NPM_ALIAS_REGEX = /^npm:(.*)@(.*)/

interface UpgradeOptions {
  wildcard?: string
  removeRange?: boolean
}

/**
 * @param version
 * @returns The number of parts in the version
 */
export function numParts(version: string) {
  const [semver] = semverutils.parseRange(version)

  if (!semver) {
    throw new Error(
      util.format(
        'semverutils.parseRange returned null when trying to parse "%s". This is probably a problem with the "semver-utils" dependency. Please report an issue at https://github.com/raineorshine/npm-check-updates/issues.',
        version,
      ),
    )
  }

  return intersection(VERSION_PARTS, Object.keys(semver)).length
}

/**
 * Increases or decreases the a precision by the given amount, e.g. major+1 -> minor
 *
 * @param precision
 * @param n
 * @returns
 */
export function precisionAdd(precision: VersionPart, n: number) {
  if (n === 0) return precision

  const index = VERSION_BASE_PARTS.includes(precision)
    ? VERSION_BASE_PARTS.indexOf(precision) + n
    : VERSION_ADDED_PARTS.includes(precision)
    ? VERSION_BASE_PARTS.length + n
    : null

  if (index === null || !VERSION_PARTS[index]) {
    throw new Error(`Invalid precision: ${precision}`)
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
export function stringify(semver: SemVer, precision?: VersionPart) {
  // get a list of the parts up until (and including) the given precision
  // or all of them, if no precision is specified
  const parts = precision ? VERSION_PARTS.slice(0, VERSION_PARTS.indexOf(precision) + 1) : VERSION_PARTS

  // pair each part with its delimiter and join together
  return parts
    .filter(part => (precision && VERSION_BASE_PARTS.includes(precision)) || semver[part])
    .map(part => VERSION_PART_DELIM[part] + (semver[part] || '0'))
    .join('')
}

/**
 * Gets how precise this version number is (major, minor, patch, release, or build)
 *
 * @param version
 * @returns
 */
export function getPrecision(version: string) {
  const [semver] = semverutils.parseRange(version)
  // expects VERSION_PARTS to be in correct order
  return VERSION_PARTS.slice().reverse().find(propertyOf(semver))
}

/**
 * Sets the precision of a (loose) semver to the specified level: major, minor, etc.
 *
 * @param version
 * @param [precision]
 * @returns
 */
export function setPrecision(version: string, precision: VersionPart) {
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
export function addWildCard(version: string, wildcard: string) {
  return wildcard === '^' || wildcard === '~' ? wildcard + version : setPrecision(version, 'major') + wildcard
}

/**
 * Returns true if the given string is one of the wild cards.
 *
 * @param version
 * @returns
 */
export function isWildCard(version: string) {
  return WILDCARD_PURE_REGEX.test(version)
}

/**
 * Returns true if the given digit is a wildcard for a part of a version.
 *
 * @param versionPart
 * @returns
 */
export function isWildPart(versionPartValue: Maybe<string>) {
  return versionPartValue === '*' || versionPartValue === 'x'
}

/**
 * Determines the part of a version string that has changed when comparing two versions. Assumes that the two version strings are in the same format. Returns null if no parts have changed.
 *
 * @param from
 * @param to
 */
export function partChanged(from: string, to: string): UpgradeGroup {
  if (from === to) return 'none'

  // separate out leading ^ or ~
  if (/^[~^]/.test(to) && to[0] === from[0]) {
    to = to.slice(1)
    from = from.slice(1)
  }

  // split into parts
  const partsTo = to.split('.')
  const partsFrom = from.split('.')

  let i = partsTo.findIndex((partto, i) => partto !== partsFrom[i])
  i = i >= 0 ? i : partsTo.length

  // major = red (or any change before 1.0.0)
  // minor = cyan
  // patch = green
  return partsTo[0] === '0' ? 'majorVersionZero' : i === 0 ? 'major' : i === 1 ? 'minor' : 'patch'
}

/**
 * Returns a list of group heading and a map of package names and versions.
 * Used with --format group and takes into account the custom --group function.
 */
export function getDependencyGroups(
  newDependencies: Index<string>,
  oldDependencies: Index<string>,
  options: Options,
): { heading: string; groupName: string; packages: Index<string> }[] {
  const groups = keyValueBy<string, Index<string>>(newDependencies, (dep, to, accum) => {
    const from = oldDependencies[dep]
    const defaultGroup = partChanged(from, to)
    const userDefinedUpgradeGroup =
      options.groupFunction?.(dep, defaultGroup, parseRange(from), parseRange(to), parse(newDependencies[dep])) ??
      defaultGroup
    if (userDefinedUpgradeGroup === 'none') {
      return accum
    }
    return {
      ...accum,
      [userDefinedUpgradeGroup]: {
        ...accum[userDefinedUpgradeGroup],
        [dep]: to,
      },
    }
  })

  // get the the text for the default group headings
  const headings = {
    patch: chalk.green(chalk.bold('Patch') + '   Backwards-compatible bug fixes'),
    minor: chalk.cyan(chalk.bold('Minor') + '   Backwards-compatible features'),
    major: chalk.red(chalk.bold('Major') + '   Potentially breaking API changes'),
    majorVersionZero: chalk.magenta(chalk.bold('Major version zero') + '   Anything may change'),
  }

  const groupOrder = uniq(['patch', 'minor', 'major', 'majorVersionZero', ...sortBy(Object.keys(groups))])

  return groupOrder
    .filter(groupName => {
      return groupName in groups
    })
    .map(groupName => {
      return {
        groupName,
        heading: groupName in headings ? headings[groupName as keyof typeof headings] : groupName,
        packages: groups[groupName],
      }
    })
}

/**
 * Colorize the parts of a version string (to) that are different than
 * another (from). Assumes that the two version strings are in the same format.
 *
 * @param from
 * @param to
 * @returns
 */
export function colorizeDiff(from: string, to: string) {
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
  const color = i === 0 || partsToColor[0] === '0' ? 'red' : i === 1 ? 'cyan' : 'green'

  // if we are colorizing only part of the word, add a dot in the middle
  const middot = i > 0 && i < partsToColor.length ? '.' : ''

  return leadingWildcard + partsToColor.slice(0, i).join('.') + middot + chalk[color](partsToColor.slice(i).join('.'))
}

/**
 * Extract prerelease tag, omitting build number
 * Example: 1.0.0-next.alpha.2 -> next.alpha
 *
 * @param version
 */
const getPre = (version: string) => {
  const pre = semver.prerelease(version)
  return pre && pre.slice(0, -1).join('.')
}

/**
 * Check if it is allowed to compare two versions based on their prerelease tag
 *
 * SemVer both states that different prerelease versions can`t be compared
 * and at the same time compares them as part of the version via strcmp
 *
 * @param a
 * @param b
 * @returns True if two versions can be compared by the means of SemVer
 */
export function isComparable(a: string, b: string) {
  const preA = getPre(a)
  const preB = getPre(b)
  return typeof preA !== 'string' || typeof preB !== 'string' || preA === preB
}

/** Comparator used to sort semver versions */
export function compareVersions(a: string, b: string) {
  const isValid = semver.valid(a) && semver.valid(b)
  const isGreater = isValid ? semver.gt(a, b) : a > b
  return isGreater ? 1 : a === b ? 0 : -1
}

/**
 * Finds the greatest version at the given level (minor|patch).
 *
 * @param versions  Unsorted array of all available versions
 * @param current   Current version or range
 * @param level     major|minor
 * @returns         String representation of the suggested version.
 */
export function findGreatestByLevel(versions: string[], current: string, level: VersionLevel): string | null {
  if (!semver.validRange(current)) {
    return null
  }

  const cur = semver.minVersion(current)
  const versionsSorted = [...versions].sort(compareVersions).filter(v => {
    const parsed = semver.parse(v)
    return (
      parsed &&
      (level === 'major' || parsed.major === cur?.major) &&
      (level === 'major' || level === 'minor' || parsed.minor === cur?.minor)
    )
  })

  return last(versionsSorted) || null
}

/**
 * @param version
 * @returns True if the version is any kind of prerelease: alpha, beta, rc, pre
 */
export function isPre(version: string) {
  return getPrecision(version) === 'release'
}

/** Checks if a string is a simple version in the format "v1". */
const isMissingMinorAndPatch = (s: string) => /^[vV]?\d+$/.test(s)

/** Checks if a version string is missing its match component, e.g. "1.0". */
const isMissingPatch = (s: string) => /^[vV]?\d+\.\d+$/.test(s)

/** Removes a leading 'v' or 'V' from a pseudo version.. */
const fixLeadingV = (s: string) => s.replace(/^[vV]/, '')

/** Converts a pseudo version that is missing its minor and patch components into a valid semver version. NOOP for valid semver versions. */
const fixMissingMinorAndPatch = (s: string) => (isMissingMinorAndPatch(s) ? s + '.0.0' : s)

/** Converts a pseudo version that is missing its patch component into a valid semver version. NOOP for valid semver versions. */
const fixMissingPatch = (s: string) => (isMissingPatch(s) ? s + '.0' : s)

/** Converts a pseudo version into a valid semver version. NOOP for valid semver versions. */
export const fixPseudoVersion = flow(fixLeadingV, fixMissingMinorAndPatch, fixMissingPatch)

/**
 * Returns 'v' if the string starts with a v, otherwise returns empty string.
 *
 * @param str
 * @returns
 */
export function v(str: Maybe<string>) {
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
export const createNpmAlias = (name: string, version: string) => `npm:${name}@${version}`

/**
 * Parses an npm alias into a [name, version] 2-tuple.
 *
 * @returns  [name, version] or null if the input is not an npm alias
 * @example  'npm:chalk@1.0.0' -> ['chalk', '1.0.0']
 */
export const parseNpmAlias = (alias: string) => {
  const match = alias && alias.match && alias.match(NPM_ALIAS_REGEX)
  return match && match.slice(1)
}

/**
 * Returns true if a version declaration is an npm alias.
 */
export const isNpmAlias = (declaration: string) => declaration && !!declaration.match(NPM_ALIAS_REGEX)

/**
 * Replaces the version number embedded in an npm alias.
 */
export const upgradeNpmAlias = (declaration: string, upgraded: string) => {
  const npmAlias = parseNpmAlias(declaration)
  if (!npmAlias) return null
  return createNpmAlias(npmAlias[0], upgraded)
}

/**
 * Returns true if a version declaration is a Github URL with a valid semver version.
 */
export const isGithubUrl = (declaration: string | null) => {
  if (!declaration) return false
  let parsed = null
  try {
    parsed = parseGithubUrl(declaration)
  } catch {
    // Strings like `npm:postman-request@2.88.1-postman.33` can throw errors instead of simply returning null
    // In node 18.17+ due to url.parse regressison: https://github.com/nodejs/node/issues/49330
    // So if this throws, we can assume it's not a valid Github URL.
  }
  if (!parsed || !parsed.branch) return false

  const version = decodeURIComponent(parsed.branch).replace(/^semver:/, '')
  return !!semver.validRange(version)
}

/**
 * Returns the embedded tag in a Github URL.
 */
export const getGithubUrlTag = (declaration: string | null) => {
  if (!declaration) return null
  const parsed = parseGithubUrl(declaration)
  if (!parsed || !parsed.branch) return null
  const version = decodeURIComponent(parsed.branch).replace(/^semver:/, '')
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
export function upgradeDependencyDeclaration(
  declaration: string,
  latestVersion: string | null,
  options: UpgradeOptions = {},
) {
  options.wildcard = options.wildcard || DEFAULT_WILDCARD

  if (!latestVersion) {
    return declaration
  }

  // parse the latestVersion
  // return original declaration if latestSemver is invalid
  const [latestSemver] = semverutils.parseRange(latestVersion)
  if (!latestSemver) {
    return declaration
  }

  // return global wildcards immediately
  if (options.removeRange) {
    return latestVersion
  } else if (isWildCard(declaration)) {
    return declaration
  }

  // parse the declaration
  // if multiple ranges, use the semver with the least number of parts
  const parsedRange: SemVer[] = flow([
    // semver-utils includes empty entries for the || and - operators. We can remove them completely
    ranges => reject(ranges, { operator: '||' }),
    ranges => reject(ranges, { operator: '-' }),
    ranges => sortBy(ranges, ary(flow(stringify, numParts), 1)),
  ])(semverutils.parseRange(declaration))
  const [declaredSemver] = parsedRange

  /**
   * Chooses version parts between the declared version and the latest.
   * Base parts (major, minor, patch) are only included if they are in the original declaration.
   * Added parts (release, build) are always included. They are only present if we are checking --greatest versions
   * anyway.
   */
  function chooseVersion(part: VersionPart): string | null {
    return (
      (isWildPart(declaredSemver[part])
        ? declaredSemver[part]
        : VERSION_BASE_PARTS.includes(part) && declaredSemver[part]
        ? latestSemver[part]
        : VERSION_ADDED_PARTS.includes(part)
        ? latestSemver[part]
        : null) || null
    )
  }

  // create a new semver object with major, minor, patch, build, and release parts
  const newSemver = keyValueBy(VERSION_PARTS, (part: VersionPart) => ({
    [part]: chooseVersion(part),
  }))
  const newSemverString = stringify(newSemver)
  const version = v(declaredSemver.semver) + newSemverString

  // determine the operator
  // do not compact, because [undefined, '<'] must be differentiated from ['<']
  const uniqueOperators = uniq(parsedRange.map(range => range.operator))
  const operator = uniqueOperators[0] || ''

  const hasWildCard = WILDCARDS.some(wildcard => newSemverString.includes(wildcard))
  const isLessThanOrEqual = uniqueOperators[0] === '<' || uniqueOperators[0] === '<='
  const isGreaterThan = uniqueOperators[0] === '>'
  const isMixed = uniqueOperators.length > 1

  // convert versions with </<= or mixed operators into the preferred wildcard
  // only do so if the new version does not already contain a wildcard
  return !hasWildCard && (isLessThanOrEqual || isMixed)
    ? addWildCard(version, options.wildcard)
    : // convert > to >= since there are likely no available versions > latest
      // https://github.com/raineorshine/npm-check-updates/issues/957
      (isGreaterThan ? '>=' : operator) + version
}

/** Reverts a valid semver version to a pseudo version that is missing its minor and patch components. NOOP If the original version was a valid semver version. */
const revertMissingMinorAndPatch = curry((current: string, latest: string) =>
  isMissingMinorAndPatch(current) ? latest.slice(0, latest.length - '.0.0'.length) : latest,
)

/** Reverts a valid semver version to a pseudo version that is missing its patch components. NOOP If the original version was a valid semver version. */
const revertMissingPatch = curry((current: string, latest: string) =>
  isMissingPatch(current) ? latest.slice(0, latest.length - '.0'.length) : latest,
)

/** Reverts a valid semver version to a pseudo version with a leading 'v'. NOOP If the original version was a valid semver version. */
const revertLeadingV = curry((current: string, latest: string) => (v(current) ? v(current) + latest : latest))

/** Reverts a valid semver version to a pseudo version. NOOP If the original version was a valid semver version. */
const revertPseudoVersion = (current: string, latest: string) =>
  flow(revertLeadingV(current), revertMissingMinorAndPatch(current), revertMissingPatch(current))(latest)

/**
 * Replaces the version number embedded in a Github URL.
 */
export const upgradeGithubUrl = (declaration: string, upgraded: string) => {
  // convert upgraded to a proper semver version if it is a pseudo version, otherwise revertPseudoVersion will return an empty string
  const upgradedNormalized = fixPseudoVersion(upgraded)
  const parsedUrl = parseGithubUrl(declaration)
  if (!parsedUrl) return declaration
  const tag = decodeURIComponent(parsedUrl.branch).replace(/^semver:/, '')
  return declaration.replace(tag, upgradeDependencyDeclaration(tag, revertPseudoVersion(tag, upgradedNormalized)))
}
