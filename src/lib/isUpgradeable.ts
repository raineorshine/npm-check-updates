import { Version, VersionSpec } from '../types'
import { fixPseudoVersion, stringify, isWildCard } from '../version-util'
import * as semver from 'semver'
import semverutils from 'semver-utils'

/**
 * Check if a version satisfies the latest, and is not beyond the latest). Ignores `v` prefix.
 *
 * @param current
 * @param latest
 * @returns
 */
function isUpgradeable(current: VersionSpec, latest: Version) {

  // do not upgrade non-npm version declarations (such as git tags)
  // do not upgrade wildcards
  if (!semver.validRange(current) || isWildCard(current)) {
    return false
  }

  // remove the constraint (e.g. ^1.0.1 -> 1.0.1) to allow upgrades that satisfy the range, but are out of date
  const [range] = semverutils.parseRange(current)
  if (!range) {
    throw new Error(`"${current}" could not be parsed by semver-utils. This is probably a bug. Please file an issue at https://github.com/raineorshine/npm-check-updates.`)
  }

  // allow upgrading of pseudo versions such as "v1" or "1.0"
  const latestNormalized = fixPseudoVersion(latest)

  const version = stringify(range)
  const isValidCurrent = Boolean(semver.validRange(version))
  const isValidLatest = Boolean(semver.valid(latestNormalized))

  // make sure it is a valid range
  // not upgradeable if the latest version satisfies the current range
  // not upgradeable if the specified version is newer than the latest (indicating a prerelease version)
  // NOTE: When "<" is specified with a single digit version, e.g. "<7", and has the same major version as the latest, e.g. "7", isSatisfied(latest, version) will return true since it ignores the "<". In this case, test the original range (current) rather than the versionUtil output (version).
  return isValidCurrent &&
    isValidLatest &&
    !semver.satisfies(latestNormalized, range.operator === '<' ? current : version) &&
    !semver.ltr(latestNormalized, version)
}

export default isUpgradeable
