import semver from 'semver'
import * as versionUtil from '../lib/version-util'
import { CooldownFunction } from '../types/CooldownFunction'
import { Index } from '../types/IndexType'
import { Maybe } from '../types/Maybe'
import { Options } from '../types/Options'
import { Packument } from '../types/Packument'
import { Version } from '../types/Version'

/**
 * @param versionResult  Available version
 * @param options     Options
 * @returns         True if deprecated versions are allowed or the version is not deprecated
 */
export function allowDeprecatedOrIsNotDeprecated(versionResult: Partial<Packument>, options: Options): boolean {
  return options.deprecated || !versionResult.deprecated
}

/**
 * @param versionResult  Available version
 * @param options     Options
 * @returns         True if pre-releases are allowed or the version is not a pre-release
 */
export function allowPreOrIsNotPre(versionResult: Partial<Packument>, options: Options): boolean {
  if (options.pre) return true
  return !versionResult.version || !versionUtil.isPre(versionResult.version)
}

/**
 * Returns true if the node engine requirement is satisfied or not specified for a given package version.
 *
 * @param versionResult     Version object returned by packument.
 * @param nodeEngineVersion The value of engines.node in the package file.
 * @returns                 True if the node engine requirement is satisfied or not specified.
 */
export function satisfiesNodeEngine(versionResult: Partial<Packument>, nodeEngineVersion: Maybe<string>): boolean {
  if (!nodeEngineVersion) return true
  const minVersion = semver.minVersion(nodeEngineVersion)?.version
  if (!minVersion) return true
  const versionNodeEngine: string | undefined = versionResult?.engines?.node
  return !versionNodeEngine || semver.satisfies(minVersion, versionNodeEngine)
}

/**
 * Returns true if the peer dependencies requirement is satisfied or not specified for a given package version.
 *
 * @param versionResult     Version object returned by packument.
 * @param peerDependencies  The list of peer dependencies.
 * @returns                 True if the peer dependencies are satisfied or not specified.
 */
export function satisfiesPeerDependencies(versionResult: Partial<Packument>, peerDependencies: Index<Index<Version>>) {
  if (!peerDependencies) return true
  return Object.values(peerDependencies).every(
    peers =>
      peers[versionResult.name!] === undefined || semver.satisfies(versionResult.version!, peers[versionResult.name!]),
  )
}

/**
 * Determines if a package version satisfies the specified cooldown period.
 *
 * @param versionResult - Partial packument object containing version and release time information.
 * @param cooldownDays - The cooldown period in days. If not specified or invalid, the function returns true.
 * @returns `true` if the version's release date is older than the cooldown period, otherwise `false`.
 */
export function satisfiesCooldownPeriod(
  versionResult: Partial<Packument>,
  cooldownDaysOrPredicateFn: Maybe<number> | Maybe<CooldownFunction>,
): boolean {
  const version = versionResult.version
  const versionTimeData = versionResult?.time?.[version!]

  if (!cooldownDaysOrPredicateFn) return true
  if (!versionTimeData) return false

  const versionReleaseDate = new Date(versionTimeData)
  const DAY_AS_MS = 86400000 // milliseconds in a day
  const cooldownDays =
    typeof cooldownDaysOrPredicateFn === 'function'
      ? (cooldownDaysOrPredicateFn(versionResult.name!) ?? 0) // when null or undefined is returned cooldown is skipped for given package
      : cooldownDaysOrPredicateFn

  return Date.now() - versionReleaseDate.getTime() >= cooldownDays * DAY_AS_MS
}

/** Returns a composite predicate that filters out deprecated, prerelease, and node engine incompatibilies from version objects returns by packument. */
export function filterPredicate(options: Options) {
  const predicators: (((o: Partial<Packument>) => boolean) | null)[] = [
    o => allowDeprecatedOrIsNotDeprecated(o, options),
    o => allowPreOrIsNotPre(o, options),
    options.enginesNode ? o => satisfiesNodeEngine(o, options.nodeEngineVersion) : null,
    options.peerDependencies ? o => satisfiesPeerDependencies(o, options.peerDependencies!) : null,
    options.cooldown ? o => satisfiesCooldownPeriod(o, options.cooldown) : null,
  ]

  return (o: Partial<Packument>) => predicators.every(predicator => (predicator ? predicator(o) : true))
}
