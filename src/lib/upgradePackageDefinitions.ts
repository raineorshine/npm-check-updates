import isEmpty from 'lodash/isEmpty'
import isEqual from 'lodash/isEqual'
import pickBy from 'lodash/pickBy'
import { satisfies } from 'semver'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry'
import keyValueBy from './keyValueBy'
import queryVersions from './queryVersions'
import upgradeDependencies from './upgradeDependencies'

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
    result?.version
      ? {
          [dep]: result.version,
        }
      : null,
  )

  const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, {
    target: options.target,
    removeRange: options.removeRange,
  })

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
