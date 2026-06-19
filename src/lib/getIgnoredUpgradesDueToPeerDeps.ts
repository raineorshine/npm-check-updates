import semver from 'semver'
import { type IgnoredUpgradeDueToPeerDeps } from '../types/IgnoredUpgradeDueToPeerDeps.ts'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry.ts'
import upgradePackageDefinitions from './upgradePackageDefinitions.ts'

/** Get all upgrades that are ignored due to incompatible peer dependencies. */
export async function getIgnoredUpgradesDueToPeerDeps(
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<Version>>,
  options: Options = {},
) {
  const upgradedPackagesWithPeerRestriction = {
    ...current,
    ...upgraded,
  }
  const [upgradedLatestVersions, latestVersionResults] = await upgradePackageDefinitions(current, {
    ...options,
    peer: false,
    peerDependencies: undefined,
    loglevel: 'silent',
  })
  const upgradedPeerDependenciesLatest = await getPeerDependenciesFromRegistry(
    Object.fromEntries(
      Object.entries(upgradedLatestVersions).map(([packageName, versionSpec]) => {
        return [
          packageName,
          // git urls and other non-semver versions are ignored.
          // Make sure versionSpec is a valid semver range; otherwise, minVersion will throw.
          semver.validRange(versionSpec) ? (semver.minVersion(versionSpec)?.version ?? versionSpec) : versionSpec,
        ]
      }),
    ),
    options,
  )

  const ignored: Index<IgnoredUpgradeDueToPeerDeps> = {}
  for (const [pkgName, newVersion] of Object.entries(upgradedLatestVersions)) {
    if (upgraded[pkgName] === newVersion) continue

    const reason: Index<string> = {}
    for (const [peerPkg, peers] of Object.entries(upgradedPeerDependencies)) {
      if (
        peers[pkgName] !== undefined &&
        latestVersionResults[pkgName]?.version &&
        !semver.satisfies(latestVersionResults[pkgName].version!, peers[pkgName])
      ) {
        reason[peerPkg] = !semver.validRange(peers[pkgName])
          ? `a range that semver does not understand: ${peers[pkgName]}. This range does not work with semver.satisfies or semver.intersects, which npm-check-updates relies on to determine peer dependency compatibility. Either this is a mistake in ${peerPkg}, or it relies on a new syntax that is not compatible with the semver package.`
          : peers[pkgName]
      }
    }

    if (Object.keys(reason).length === 0) {
      const peersOfPkg = upgradedPeerDependenciesLatest?.[pkgName] || {}
      for (const [peer, peerSpec] of Object.entries(peersOfPkg)) {
        if (
          upgradedPackagesWithPeerRestriction[peer] &&
          // Non-semver specs like catalog: references cannot be compared; treat as compatible
          !!semver.validRange(upgradedPackagesWithPeerRestriction[peer]) &&
          semver.validRange(peerSpec) &&
          !semver.intersects(upgradedPackagesWithPeerRestriction[peer], peerSpec)
        ) {
          reason[pkgName] = `${peer} ${peerSpec}`
        }
      }
    }

    ignored[pkgName] = {
      from: current[pkgName],
      to: newVersion,
      reason,
    }
  }
  return ignored
}

export default getIgnoredUpgradesDueToPeerDeps
