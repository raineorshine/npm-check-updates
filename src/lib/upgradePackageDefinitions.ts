import { dequal } from 'dequal'
import { minVersion, satisfies } from 'semver'
import { parse, parseRange } from 'semver-utils'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry'
import keyValueBy from './keyValueBy'
import { pickBy } from './pick'
import queryVersions from './queryVersions'
import upgradeDependencies from './upgradeDependencies'

type CheckIfInPeerViolationResult = {
  violated: boolean
  filteredUpgradedDependencies: Index<VersionSpec>
  upgradedPeerDependencies: Index<Index<VersionSpec>>
}

/**
 * Check if the peer dependencies constraints of each upgraded package, are in violation,
 * thus rendering the upgrade to be invalid
 *
 * @returns Whether there was any violation, and the upgrades that are not in violation
 */
const checkIfInPeerViolation = (
  currentDependencies: Index<VersionSpec>,
  filteredUpgradedDependencies: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<VersionSpec>>,
): CheckIfInPeerViolationResult => {
  const upgradedDependencies = { ...currentDependencies, ...filteredUpgradedDependencies }
  const upgradedDependenciesVersions = Object.fromEntries(
    Object.entries(upgradedDependencies).map(([packageName, versionSpec]) => {
      return [packageName, minVersion(versionSpec)?.version ?? versionSpec]
    }),
  )
  const filteredUpgradedPeerDependencies = { ...upgradedPeerDependencies }
  let violated = false
  const filteredUpgradedDependenciesAfterPeers = pickBy(filteredUpgradedDependencies, (spec, dep) => {
    const peerDeps = filteredUpgradedPeerDependencies[dep]
    if (!peerDeps) {
      return true
    }
    const valid = Object.entries(peerDeps).every(
      ([peer, peerSpec]) =>
        upgradedDependenciesVersions[peer] === undefined || satisfies(upgradedDependenciesVersions[peer], peerSpec),
    )
    if (!valid) {
      violated = true
      delete filteredUpgradedPeerDependencies[dep]
    }
    return valid
  })
  return {
    violated,
    filteredUpgradedDependencies: filteredUpgradedDependenciesAfterPeers,
    upgradedPeerDependencies: filteredUpgradedPeerDependencies,
  }
}

export type UpgradePackageDefinitionsResult = [
  upgradedDependencies: Index<VersionSpec>,
  latestVersionResults: Index<VersionResult>,
  newPeerDependencies?: Index<Index<VersionSpec>>,
]

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
): Promise<UpgradePackageDefinitionsResult> {
  const latestVersionResults = await queryVersions(currentDependencies, options)

  const latestVersions = keyValueBy(latestVersionResults, (dep, result) =>
    result?.version &&
    (!options.filterResults ||
      options.filterResults(dep, {
        currentVersion: currentDependencies[dep],
        currentVersionSemver: parseRange(currentDependencies[dep]),
        upgradedVersion: result.version,
        upgradedVersionSemver: parse(result.version),
      }))
      ? {
          [dep]: result.version,
        }
      : null,
  )

  const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, options)

  const filteredUpgradedDependencies = pickBy(upgradedDependencies, (v, dep) => {
    return !options.jsonUpgraded || !options.minimal || !satisfies(latestVersions[dep], currentDependencies[dep])
  })

  const filteredLatestDependencies = pickBy(latestVersions, (spec, dep) => filteredUpgradedDependencies[dep])

  if (options.peer && Object.keys(filteredLatestDependencies).length > 0) {
    const upgradedPeerDependencies = await getPeerDependenciesFromRegistry(filteredLatestDependencies, options)

    let checkPeerViolationResult: CheckIfInPeerViolationResult = {
      violated: false,
      filteredUpgradedDependencies,
      upgradedPeerDependencies,
    }
    let rerunResult: UpgradePackageDefinitionsResult
    let runIndex = 0
    do {
      if (runIndex++ > 6) {
        throw new Error(`Stuck in a while loop. Please report an issue`)
      }
      const peerDependenciesAfterUpgrade = {
        ...options.peerDependencies,
        ...checkPeerViolationResult.upgradedPeerDependencies,
      }
      if (dequal(options.peerDependencies, peerDependenciesAfterUpgrade)) {
        if (runIndex > 1) {
          // We can't find anything to do, will not upgrade anything
          return [{}, latestVersionResults, options.peerDependencies]
        }
        rerunResult = [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
      } else {
        const [newUpgradedDependencies, newLatestVersions, newPeerDependencies] = await upgradePackageDefinitions(
          { ...currentDependencies, ...checkPeerViolationResult.filteredUpgradedDependencies },
          { ...options, peerDependencies: peerDependenciesAfterUpgrade, loglevel: 'silent' },
        )
        rerunResult = [
          { ...checkPeerViolationResult.filteredUpgradedDependencies, ...newUpgradedDependencies },
          { ...latestVersionResults, ...newLatestVersions },
          newPeerDependencies,
        ]
      }
      checkPeerViolationResult = checkIfInPeerViolation(currentDependencies, rerunResult[0], rerunResult[2]!)
    } while (checkPeerViolationResult.violated)
    return rerunResult
  }
  return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
}

export default upgradePackageDefinitions
