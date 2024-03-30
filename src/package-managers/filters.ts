import { get, overEvery } from 'lodash-es'
import semver from 'semver'
import * as versionUtil from '../lib/version-util.js'
import { Index } from '../types/IndexType.js'
import { Maybe } from '../types/Maybe.js'
import { Options } from '../types/Options.js'
import { Packument } from '../types/Packument.js'
import { Version } from '../types/Version.js'

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
  const minVersion = get(semver.minVersion(nodeEngineVersion), 'version')
  if (!minVersion) return true
  const versionNodeEngine: string | undefined = get(versionResult, 'engines.node')
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

/** Returns a composite predicate that filters out deprecated, prerelease, and node engine incompatibilies from version objects returns by packument. */
export function filterPredicate(options: Options): (o: Partial<Packument>) => boolean {
  return overEvery([
    o => allowDeprecatedOrIsNotDeprecated(o, options),
    o => allowPreOrIsNotPre(o, options),
    options.enginesNode ? o => satisfiesNodeEngine(o, options.nodeEngineVersion) : null!,
    options.peerDependencies ? o => satisfiesPeerDependencies(o, options.peerDependencies!) : null!,
  ])
}
