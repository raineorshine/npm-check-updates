import _ from 'lodash'
import cint from 'cint'
import { satisfies } from 'semver'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry'
import queryVersions from './queryVersions'
import upgradeDependencies from './upgradeDependencies'
import { Index, Options, Version, VersionDeclaration } from '../types'

/**
 * Returns an 3-tuple of upgradedDependencies, their latest versions and the resulting peer dependencies.
 *
 * @param currentDependencies
 * @param options
 * @returns
 */
export async function upgradePackageDefinitions(currentDependencies: Index<VersionDeclaration>, options: Options): Promise<[Index<VersionDeclaration>, Index<VersionDeclaration>, Index<Index<VersionDeclaration>>?]> {
  const latestVersions = await queryVersions(currentDependencies, options)

  const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, {
    removeRange: options.removeRange
  })

  const filteredUpgradedDependencies = _.pickBy(upgradedDependencies, (v, dep) => {
    return !options.jsonUpgraded || !options.minimal || !satisfies(latestVersions[dep], currentDependencies[dep])
  })

  if (options.peer && !_.isEmpty(filteredUpgradedDependencies)) {
    const upgradedPeerDependencies = await getPeerDependenciesFromRegistry(filteredUpgradedDependencies, options)
    const peerDependencies = { ...options.peerDependencies, ...upgradedPeerDependencies }
    if (!_.isEqual(options.peerDependencies, peerDependencies)) {
      const [newUpgradedDependencies, newLatestVersions, newPeerDependencies] = await upgradePackageDefinitions(
        { ...currentDependencies, ...filteredUpgradedDependencies },
        { ...options, peerDependencies, loglevel: 'silent' }
      )
      return [
        { ...filteredUpgradedDependencies, ...newUpgradedDependencies },
        { ...latestVersions, ...newLatestVersions },
        newPeerDependencies
      ]
    }
  }
  return [filteredUpgradedDependencies, latestVersions, options.peerDependencies]
}

export default upgradePackageDefinitions
