import { dequal } from 'dequal'
import semver, { satisfies } from 'semver'
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
  issuesFound: boolean;
  filteredUpgradedDependencies: Index<VersionSpec>;
  upgradedPeerDependencies: Index<Index<VersionSpec>>;
  removedUpgradedDependencies: Index<VersionSpec>;
}

/**
 * check if in peer violation
 *
 * @returns
 */
const checkIfInPeerViolation = (
  currentDependencies: Index<VersionSpec>,
  filteredUpgradedDependencies: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<VersionSpec>>,
): CheckIfInPeerViolationResult => {
  const upgradedDependencies = { ...currentDependencies, ...filteredUpgradedDependencies }
  const upgradedDependenciesVersions= Object.fromEntries(
    Object.entries(upgradedDependencies).map(([packageName, versionSpec]) => {
      return [packageName, semver.minVersion(versionSpec)?.version ?? versionSpec]
    }),
  );
  const filteredUpgradedPeerDependencies = { ...upgradedPeerDependencies }
  const removedUpgradedDependencies:Index<VersionSpec> = {}
  let wereUpgradedDependenceFiltered = false
  const filteredUpgradedDependenciesAfterPeers = pickBy(filteredUpgradedDependencies, (spec, dep) => {
    const peerDeps = filteredUpgradedPeerDependencies[dep]
    if (!peerDeps) {
      return true
    }
    const valid = Object.entries(peerDeps).every(([peer, peerSpec]) =>
      upgradedDependenciesVersions[peer] === undefined || semver.satisfies(upgradedDependenciesVersions[peer], peerSpec))
    if (!valid) {
      wereUpgradedDependenceFiltered = true
      removedUpgradedDependencies[dep] = spec
      delete filteredUpgradedPeerDependencies[dep]
    }
    return valid
  })
  return {
    issuesFound: wereUpgradedDependenceFiltered,
    filteredUpgradedDependencies: filteredUpgradedDependenciesAfterPeers,
    upgradedPeerDependencies: filteredUpgradedPeerDependencies,
    removedUpgradedDependencies,
  }
}

/**
 * rerun upgrade if changed peers
 *
 * @returns
 */
const rerunUpgradeIfChangedPeers = async (
  currentDependencies: Index<VersionSpec>,
  filteredUpgradedDependencies: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<VersionSpec>>,
  latestVersionResults: Index<VersionResult>,
  options: Options,
): Promise<void | [Index<VersionSpec>, Index<VersionResult>, Index<Index<VersionSpec>>?]> => {
  if (Object.keys(filteredUpgradedDependencies).length === 0) {
    return [{}, latestVersionResults, options.peerDependencies]
  }
  const peerDependencies = { ...options.peerDependencies, ...upgradedPeerDependencies }
  if (!dequal(options.peerDependencies, peerDependencies)) {
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
    let checkPeerViolationResult = checkIfInPeerViolation(
      currentDependencies,
      filteredUpgradedDependencies,
      upgradedPeerDependencies,
    )
    // Try another run to see if we can upgrade some more
    let rerunResult = await rerunUpgradeIfChangedPeers(
      currentDependencies,
      filteredUpgradedDependencies,
      upgradedPeerDependencies,
      latestVersionResults,
      options,
    )
    if (!rerunResult) {
      // Nothing changed in the rerun
      if (!checkPeerViolationResult.issuesFound) {
        // No issues were found, return
        return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
      }
      // Issues found, will keep trying without problematic packages
      while (true) {
        rerunResult = await rerunUpgradeIfChangedPeers(
          currentDependencies,
          checkPeerViolationResult.filteredUpgradedDependencies,
          checkPeerViolationResult.upgradedPeerDependencies,
          latestVersionResults,
          options,
        )
        if (!rerunResult) {
          // We can't find anything to do, will not upgrade anything
          return [{}, latestVersionResults, options.peerDependencies]
        }
        checkPeerViolationResult = checkIfInPeerViolation(
          currentDependencies,
          rerunResult[0],
          rerunResult[2]!,
        )
        if (!checkPeerViolationResult.issuesFound) {
          // We found a stable solution
          return rerunResult
        }
      }
    } else {
      // Rerun managed to make some more upgrades
      checkPeerViolationResult = checkIfInPeerViolation(
        currentDependencies,
        rerunResult[0],
        rerunResult[2]!,
      )
      if (!checkPeerViolationResult.issuesFound) {
        // No issues were found, return
        return rerunResult
      }
      // Issues found, will keep trying without problematic packages
      while (true) {
        rerunResult = await rerunUpgradeIfChangedPeers(
          currentDependencies,
          checkPeerViolationResult.filteredUpgradedDependencies,
          checkPeerViolationResult.upgradedPeerDependencies,
          latestVersionResults,
          options,
        )
        if (!rerunResult) {
          // We can't find anything to do, will not upgrade anything
          return [{}, latestVersionResults, options.peerDependencies]
        }
        checkPeerViolationResult = checkIfInPeerViolation(
          currentDependencies,
          rerunResult[0],
          rerunResult[2]!,
        )
        if (!checkPeerViolationResult.issuesFound) {
          // We found a stable solution
          return rerunResult
        }
      }
    }
  }
  return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
}

export default upgradePackageDefinitions
