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

type RerunUpgradeResult = null | [Index<VersionSpec>, Index<VersionResult>, Index<Index<VersionSpec>>?]

/**
 * rerun upgrade if changed peers
 *
 * @returns `null` if no changes were made to the peer dependence as a result of the recent upgrade
 * else returns the upgrade result
 */
const rerunUpgradeIfChangedPeers = async (
  currentDependencies: Index<VersionSpec>,
  filteredUpgradedDependencies: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<VersionSpec>>,
  latestVersionResults: Index<VersionResult>,
  options: Options,
): Promise<RerunUpgradeResult> => {
  const peerDependencies = { ...options.peerDependencies, ...upgradedPeerDependencies }
  if (dequal(options.peerDependencies, peerDependencies)) {
    return null
  }
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
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

    let rerunResult: RerunUpgradeResult
    let checkPeerViolationResult: CheckIfInPeerViolationResult = {
      violated: false,
      filteredUpgradedDependencies,
      upgradedPeerDependencies,
    }
    let runIndex = 0
    do {
      rerunResult = await rerunUpgradeIfChangedPeers(
        currentDependencies,
        checkPeerViolationResult.filteredUpgradedDependencies,
        checkPeerViolationResult.upgradedPeerDependencies,
        latestVersionResults,
        options,
      )
      if (!rerunResult) {
        if (runIndex > 0) {
          // We can't find anything to do, will not upgrade anything
          return [{}, latestVersionResults, options.peerDependencies]
        }
        checkPeerViolationResult = checkIfInPeerViolation(
          currentDependencies,
          filteredUpgradedDependencies,
          upgradedPeerDependencies,
        )
        if (!checkPeerViolationResult.violated) {
          // No issues were found, return
          return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
        }
      } else {
        checkPeerViolationResult = checkIfInPeerViolation(currentDependencies, rerunResult[0], rerunResult[2]!)
        if (!checkPeerViolationResult.violated) {
          // We found a stable solution
          return rerunResult
        }
      }
      if (runIndex++ > 5) {
        throw new Error(`Stuck in a while loop. Please report an issue`)
      }
    } while (true)
  }
  return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
}

export default upgradePackageDefinitions
