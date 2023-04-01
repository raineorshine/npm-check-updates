import isEmpty from 'lodash/isEmpty'
import isEqual from 'lodash/isEqual'
import pickBy from 'lodash/pickBy'
import { satisfies } from 'semver'
import {parse, parseRange} from 'semver-utils'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry'
import keyValueBy from './keyValueBy'
import queryVersions from './queryVersions'
import upgradeDependencies from './upgradeDependencies'

/**
 * Returns boolean result of execution of user defined function that can filter out update versions according to function logic
 *
 * @param dependencyName        The name of the dependency.
 * @param currentDependencies   Current dependencies collection object.
 * @param version               Version of the actual package.
 * @param options               The application options, used to determine which packages to return.
 */
function filterResultsByUserFunction(
  dependencyName: string,
  currentDependencies: Index<VersionSpec>,
  version: Version,
  options: Options,
) {
  return (
    !options.filterResults ||
    options.filterResults(dependencyName, {
      currentVersion: currentDependencies[dependencyName],
      currentVersionSemver: parseRange(currentDependencies[dependencyName]),
      upgradedVersion: version,
      upgradedVersionSemver: parse(version),
    })
  )
}

/**
 * Returns a 3-tuple of upgradedDependencies, their latest versions and the resulting peer dependencies.
 *
 * @param currentDependencies
 * @param options
 * @returns
 */
export async function upgradePackageDefinitions(
  currentDependencies: Index<VersionSpec>,
  options: Options,
): Promise<[Index<VersionSpec>, Index<VersionResult>, Index<Index<VersionSpec>>?]> {
  const latestVersionResults = await queryVersions(currentDependencies, options)

  const latestVersions = keyValueBy(latestVersionResults, (dep, result) =>
    result?.version && filterResultsByUserFunction(dep, currentDependencies, result.version, options)
      ? {
          [dep]: result.version,
        }
      : null,
  )

  const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, options)

  const filteredUpgradedDependencies = pickBy(upgradedDependencies, (v, dep) => {
    return !options.jsonUpgraded || !options.minimal || !satisfies(latestVersions[dep], currentDependencies[dep])
  })

  if (options.peer && !isEmpty(filteredUpgradedDependencies)) {
    const upgradedPeerDependencies = await getPeerDependenciesFromRegistry(filteredUpgradedDependencies, options)
    const peerDependencies = { ...options.peerDependencies, ...upgradedPeerDependencies }
    if (!isEqual(options.peerDependencies, peerDependencies)) {
      const [newUpgradedDependencies, newLatestVersions, newPeerDependencies] = await upgradePackageDefinitions(
        { ...currentDependencies, ...filteredUpgradedDependencies },
        { ...options, peerDependencies, loglevel: 'silent' },
      )
      return [
        { ...filteredUpgradedDependencies, ...newUpgradedDependencies },
        { ...latestVersionResults, ...newLatestVersions },
        newPeerDependencies,
      ]
    }
  }
  return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
}

export default upgradePackageDefinitions
