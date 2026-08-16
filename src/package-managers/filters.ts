import semver from 'semver'
import parseCooldown from '../lib/parseCooldown.ts'
import * as versionUtil from '../lib/version-util.ts'
import { type CooldownFunction } from '../types/CooldownFunction.ts'
import { type Index } from '../types/IndexType.ts'
import { type Maybe } from '../types/Maybe.ts'
import { type Options } from '../types/Options.ts'
import { type Packument } from '../types/Packument.ts'
import { type Version } from '../types/Version.ts'

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

/** Same as satisfiesNodeEngine, but takes the already resolved minimum node version. */
const satisfiesMinNodeVersion = (versionResult: Partial<Packument>, minNodeVersion: Maybe<string>): boolean => {
  if (!minNodeVersion) return true
  const versionNodeEngine: string | undefined = versionResult?.engines?.node
  return !versionNodeEngine || semver.satisfies(minNodeVersion, versionNodeEngine)
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
  return satisfiesMinNodeVersion(versionResult, semver.minVersion(nodeEngineVersion)?.version)
}

/**
 * Determines if a package version satisfies the specified cooldown period.
 *
 * @param packageName - Package name used when cooldown is a predicate.
 * @param version - The version string.
 * @param versionTimeData - The publish time for the specific version.
 * @param cooldownDaysOrPredicateFn - Cooldown period in days or package-name predicate.
 * If not specified or invalid, the function returns true.
 */
export const satisfiesCooldownPeriod = (
  packageName: string,
  version: Maybe<string>,
  versionTimeData: Maybe<string>,
  cooldownDaysOrPredicateFn: Maybe<number | string> | Maybe<CooldownFunction>,
): boolean => {
  if (!version) return false

  if (!cooldownDaysOrPredicateFn) return true
  // when there is no time to check wh can not check it for cooldown, always return true
  if (!versionTimeData) return true

  const versionReleaseDate = new Date(versionTimeData)
  const DAY_AS_MS = 86400000 // milliseconds in a day
  const rawCooldown =
    typeof cooldownDaysOrPredicateFn === 'function'
      ? (cooldownDaysOrPredicateFn(packageName ?? '') ?? 0) // null → 0 days = no cooldown
      : cooldownDaysOrPredicateFn
  const cooldownDays = typeof rawCooldown === 'string' ? (parseCooldown(rawCooldown) ?? 0) : rawCooldown

  return Date.now() - versionReleaseDate.getTime() >= cooldownDays * DAY_AS_MS
}

/**
 * Returns a composite predicate that filters out deprecated, prerelease,
 * and node engine incompatibilities from version objects returns by packument.
 *
 * Note: this function does not filter cooldown.
 */
export function filterPredicate(options: Options) {
  // resolve once, otherwise the range is reparsed for every candidate version
  const minNodeVersion =
    options.enginesNode && options.nodeEngineVersion ? semver.minVersion(options.nodeEngineVersion)?.version : null

  // index the peer specs by package name so each candidate version is a single lookup instead of a full scan
  const peerSpecs = new Map<string, Version[]>()
  const peerDependencies: Index<Index<Version>> | undefined = options.peerDependencies
  if (peerDependencies) {
    for (const peers of Object.values(peerDependencies)) {
      for (const [name, spec] of Object.entries(peers)) {
        const specs = peerSpecs.get(name)
        if (specs) {
          specs.push(spec)
        } else {
          peerSpecs.set(name, [spec])
        }
      }
    }
  }

  const predicates: (((o: Partial<Packument>) => boolean) | null)[] = [
    o => allowDeprecatedOrIsNotDeprecated(o, options),
    o => allowPreOrIsNotPre(o, options),
    options.enginesNode ? o => satisfiesMinNodeVersion(o, minNodeVersion) : null,
    options.peerDependencies
      ? o => (peerSpecs.get(o.name!) ?? []).every(spec => semver.satisfies(o.version!, spec))
      : null,
  ]

  return (o: Partial<Packument>) => predicates.every(predicate => (predicate ? predicate(o) : true))
}
