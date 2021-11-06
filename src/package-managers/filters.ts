import _ from 'lodash'
import semver from 'semver'
import * as versionUtil from '../version-util'
import { Index, Maybe, Options, Packument, Version } from '../types'

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
  const minVersion = _.get(semver.minVersion(nodeEngineVersion), 'version')
  if (!minVersion) return true
  const versionNodeEngine = _.get(versionResult, 'engines.node')
  return versionNodeEngine && semver.satisfies(minVersion, versionNodeEngine)
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
    peers => peers[versionResult.name] === undefined || semver.satisfies(versionResult.version, peers[versionResult.name])
  )
}
