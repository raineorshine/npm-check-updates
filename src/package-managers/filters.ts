import get from 'lodash/get'
import overEvery from 'lodash/overEvery'
import semver from 'semver'
import * as versionUtil from '../lib/version-util'
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
export function allowDeprecatedOrIsNotDeprecated(versionResult: Packument, options: Options): boolean {
  if (options.deprecated) return true
  return !versionResult.deprecated
}

/**
 * @param versionResult  Available version
 * @param options     Options
 * @returns         True if pre-releases are allowed or the version is not a pre-release
 */
export function allowPreOrIsNotPre(versionResult: Packument, options: Options): boolean {
  if (options.pre) return true
  return !versionUtil.isPre(versionResult.version)
}

/**
 * Returns true if the node engine requirement is satisfied or not specified for a given package version.
 *
 * @param versionResult     Version object returned by pacote.packument.
 * @param nodeEngineVersion The value of engines.node in the package file.
 * @returns                 True if the node engine requirement is satisfied or not specified.
 */
export function satisfiesNodeEngine(versionResult: Packument, nodeEngineVersion: Maybe<string>): boolean {
  if (!nodeEngineVersion) return true
  const minVersion = get(semver.minVersion(nodeEngineVersion), 'version')
  if (!minVersion) return true
  const versionNodeEngine: string | undefined = get(versionResult, 'engines.node')
  return !!versionNodeEngine && semver.satisfies(minVersion, versionNodeEngine)
}

/**
 * Returns true if the peer dependencies requirement is satisfied or not specified for a given package version.
 *
 * @param versionResult     Version object returned by pacote.packument.
 * @param peerDependencies  The list of peer dependencies.
 * @returns                 True if the peer dependencies are satisfied or not specified.
 */
export function satisfiesPeerDependencies(versionResult: Packument, peerDependencies: Index<Index<Version>>) {
  if (!peerDependencies) return true
  return Object.values(peerDependencies).every(
    peers =>
      peers[versionResult.name] === undefined || semver.satisfies(versionResult.version, peers[versionResult.name]),
  )
}

/** Returns a composite predicate that filters out deprecated, prerelease, and node engine incompatibilies from version objects returns by pacote.packument. */
export function filterPredicate(options: Options): (o: Packument) => boolean {
  return overEvery([
    o => allowDeprecatedOrIsNotDeprecated(o, options),
    o => allowPreOrIsNotPre(o, options),
    options.enginesNode ? o => satisfiesNodeEngine(o, options.nodeEngineVersion) : null!,
    options.peerDependencies ? o => satisfiesPeerDependencies(o, options.peerDependencies!) : null!,
    options.filterFetched ? o => options.filterFetched!(o) : null!,
  ])
}
