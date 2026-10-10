import { isDeepStrictEqual } from 'node:util'
import semver from 'semver'
import { parse, parseRange } from 'semver-utils'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type VersionResult } from '../types/VersionResult.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry.ts'
import keyValueBy from './keyValueBy.ts'
import listedDependencies from './listedDependencies.ts'
import { mergePeerDependencies, rootOf } from './peerPaths.ts'
import { pickBy } from './pick.ts'
import queryVersions from './queryVersions.ts'
import upgradeDependencies from './upgradeDependencies.ts'

type CheckIfInPeerViolationResult = {
  violated: boolean
  filteredUpgradedDependencies: Index<VersionSpec>
  upgradedPeerDependencies: Index<Index<VersionSpec>>
}

/** Returns true if a peer spec allows the given version spec, or if either one cannot be compared. */
const satisfiesPeer = (spec: VersionSpec | undefined, peerSpec: VersionSpec) =>
  spec === undefined ||
  !semver.validRange(peerSpec) ||
  // Non-semver specs like catalog: references cannot be compared; treat as compatible
  !semver.validRange(spec) ||
  semver.intersects(spec, peerSpec)

/**
 * Checks every peer spec in force against the upgraded versions, and rejects the upgrades that violate one. An upgrade
 * whose own peers are violated is rejected. So is an upgrade that violates the peers of a package that stays at its
 * current version, since rejecting an upgrade puts the peers of its current version back in force.
 *
 * @param basePeerDependencies The peers of the current versions, which replace the peers of rejected upgrades.
 * @returns Whether there was any violation, the upgrades that are not in violation, and the peers that remain in force
 */
const checkIfInPeerViolation = (
  currentDependencies: Index<VersionSpec>,
  basePeerDependencies: Index<Index<VersionSpec>> | undefined,
  filteredUpgradedDependencies: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<VersionSpec>>,
): CheckIfInPeerViolationResult => {
  let upgrades = filteredUpgradedDependencies
  let peerDependencies = upgradedPeerDependencies
  // rejecting one upgrade can put a peer spec back in force that another upgrade violates, so repeat until none do
  for (;;) {
    const versions = { ...currentDependencies, ...upgrades }
    const rejected = new Set<string>()
    for (const [key, peers] of Object.entries(peerDependencies)) {
      // includes the peers of any unlisted peers a package brings in
      const dep = rootOf(key)
      for (const [peer, peerSpec] of Object.entries(peers)) {
        if (satisfiesPeer(versions[peer], peerSpec)) continue
        if (upgrades[dep]) rejected.add(dep)
        else if (upgrades[peer]) rejected.add(peer)
      }
    }
    if (rejected.size === 0) break
    upgrades = pickBy(upgrades, (spec, dep) => !rejected.has(dep as string))
    // drop the peers of rejected upgrades, including those of the unlisted peers they would have brought in
    peerDependencies = mergePeerDependencies(
      basePeerDependencies,
      pickBy(peerDependencies, (spec, key) => !rejected.has(rootOf(key as string))),
    )
  }
  return {
    violated: upgrades !== filteredUpgradedDependencies,
    filteredUpgradedDependencies: upgrades,
    upgradedPeerDependencies: peerDependencies,
  }
}

/**
 * Merges a peer recursion pass into the previous one. The recursion requeries at the already
 * upgraded spec, so a result with no version means nothing more to upgrade to.
 */
const mergeVersionResults = (previous: Index<VersionResult>, next: Index<VersionResult>): Index<VersionResult> =>
  keyValueBy({ ...previous, ...next }, (dep, result) => ({
    [dep]: !result.version && !result.error && previous[dep]?.version ? previous[dep] : result,
  }))

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
    return !options.jsonUpgraded || !options.minimal || !semver.satisfies(latestVersions[dep], currentDependencies[dep])
  })

  const filteredLatestDependencies = pickBy(latestVersions, (spec, dep) => filteredUpgradedDependencies[dep])

  let result: UpgradePackageDefinitionsResult = [
    filteredUpgradedDependencies,
    latestVersionResults,
    options.peerDependencies,
  ]

  if (!options.peer || Object.keys(filteredLatestDependencies).length === 0) {
    return result
  }

  const upgradedPeerDependencies = await getPeerDependenciesFromRegistry(
    filteredLatestDependencies,
    options,
    listedDependencies(currentDependencies, options),
  )

  let checkPeerViolationResult: CheckIfInPeerViolationResult

  if (
    isDeepStrictEqual(
      options.peerDependencies,
      mergePeerDependencies(options.peerDependencies, upgradedPeerDependencies),
    )
  ) {
    checkPeerViolationResult = checkIfInPeerViolation(
      currentDependencies,
      options.peerDependencies,
      filteredUpgradedDependencies,
      options.peerDependencies!,
    )
    if (!checkPeerViolationResult.violated) {
      return result
    }
  } else {
    checkPeerViolationResult = {
      violated: false,
      filteredUpgradedDependencies,
      upgradedPeerDependencies,
    }
  }

  let runCount = 0
  do {
    if (runCount++ > 6) {
      throw new Error(`Stuck in a while loop. Please report an issue`)
    }
    const peerDependenciesAfterUpgrade = mergePeerDependencies(
      options.peerDependencies,
      checkPeerViolationResult.upgradedPeerDependencies,
    )
    if (isDeepStrictEqual(options.peerDependencies, peerDependenciesAfterUpgrade)) {
      // Peers stopped changing; keep the upgrades that do not violate them
      return [checkPeerViolationResult.filteredUpgradedDependencies, latestVersionResults, options.peerDependencies]
    }
    const [newUpgradedDependencies, newLatestVersions, newPeerDependencies] = await upgradePackageDefinitions(
      { ...currentDependencies, ...checkPeerViolationResult.filteredUpgradedDependencies },
      { ...options, peerDependencies: peerDependenciesAfterUpgrade, loglevel: 'silent' },
    )
    result = [
      { ...checkPeerViolationResult.filteredUpgradedDependencies, ...newUpgradedDependencies },
      mergeVersionResults(latestVersionResults, newLatestVersions),
      newPeerDependencies,
    ]
    checkPeerViolationResult = checkIfInPeerViolation(currentDependencies, options.peerDependencies, result[0], result[2]!)
  } while (checkPeerViolationResult.violated)

  return result
}

export default upgradePackageDefinitions
