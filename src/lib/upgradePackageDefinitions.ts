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

/**
 * check if in peer violation
 *
 * @returns
 */
const checkIfInPeerViolation = (
  currentDependencies: Index<VersionSpec>,
  filteredUpgradedDependencies: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<VersionSpec>>,
  latestVersionResults: Index<VersionResult>,
) => {
  const upgradedDependencies = { ...currentDependencies, ...filteredUpgradedDependencies }
  const filteredLatestDependencies = pickBy(latestVersionResults, (spec, dep) => upgradedDependencies[dep])
  const filteredUpgradedPeerDependencies = {...upgradedPeerDependencies}
  let wereUpgradedDependenceFiltered = false
  const filteredUpgradedDependenciesAfterPeers = pickBy(filteredUpgradedDependencies, (spec, dep) => {
    const peerDeps = filteredUpgradedPeerDependencies[dep]
    if (!peerDeps) {
      return true
    }
    const valid = Object.entries(peerDeps).every(([peer, peerSpec]) => {
      const version = filteredLatestDependencies[peer]?.version
      return !version || semver.satisfies(version, peerSpec)
    })
    if (!valid) {
      wereUpgradedDependenceFiltered = true;
      delete filteredUpgradedPeerDependencies[dep]
    }
    return valid
  })
  return {
    issuesFound: wereUpgradedDependenceFiltered,
    filteredUpgradedDependencies: filteredUpgradedDependenciesAfterPeers,
    upgradedPeerDependencies: filteredUpgradedPeerDependencies
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
    const checkPeerViolationResult = checkIfInPeerViolation(currentDependencies, filteredUpgradedDependencies, upgradedPeerDependencies, latestVersionResults)
    if (checkPeerViolationResult.issuesFound) {
      const fullRerunResult = await rerunUpgradeIfChangedPeers(
        currentDependencies,
        filteredUpgradedDependencies,
        upgradedPeerDependencies,
        latestVersionResults,
        options,
      )
      if (fullRerunResult) {
        const checkPeerViolationResultFullRerun = checkIfInPeerViolation(currentDependencies, fullRerunResult[0], fullRerunResult[2]!, fullRerunResult[1])
        if (!checkPeerViolationResultFullRerun.issuesFound) {
          return fullRerunResult
        }
      }
      const partialRerunResult = await rerunUpgradeIfChangedPeers(
        currentDependencies,
        checkPeerViolationResult.filteredUpgradedDependencies,
        checkPeerViolationResult.upgradedPeerDependencies,
        latestVersionResults,
        options,
      )
      if (partialRerunResult) {
        const checkPeerViolationResultPartialRerun = checkIfInPeerViolation(currentDependencies, partialRerunResult[0], partialRerunResult[2]!, partialRerunResult[1])
        if (!checkPeerViolationResultPartialRerun.issuesFound) {
          return partialRerunResult
        }
      }
      return [checkPeerViolationResult.filteredUpgradedDependencies, latestVersionResults, checkPeerViolationResult.upgradedPeerDependencies]
    } else {
      const rerunResult = await rerunUpgradeIfChangedPeers(
        currentDependencies,
        filteredUpgradedDependencies,
        upgradedPeerDependencies,
        latestVersionResults,
        options,
      )
      if (rerunResult) {
        return rerunResult
      }
    }
  }
  return [filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
}

export default upgradePackageDefinitions
