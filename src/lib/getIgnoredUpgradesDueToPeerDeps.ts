import { intersects, minVersion, satisfies, validRange } from 'semver'
import { IgnoredUpgradeDueToPeerDeps } from '../types/IgnoredUpgradeDueToPeerDeps'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry'
import upgradePackageDefinitions from './upgradePackageDefinitions'

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
          // Make sure versionSpec is a valid semver range, otherwise minVersion will throw.
          validRange(versionSpec) ? (minVersion(versionSpec)?.version ?? versionSpec) : versionSpec,
        ]
      }),
    ),
    options,
  )
  return Object.entries(upgradedLatestVersions)
    .filter(([pkgName, newVersion]) => upgraded[pkgName] !== newVersion)
    .reduce((accum, [pkgName, newVersion]) => {
      let reason = Object.entries(upgradedPeerDependencies)
        .filter(
          ([, peers]) =>
            peers[pkgName] !== undefined &&
            latestVersionResults[pkgName]?.version &&
            !satisfies(latestVersionResults[pkgName].version!, peers[pkgName]),
        )
        .reduce(
          (accumReason, [peerPkg, peers]) => ({
            ...accumReason,
            [peerPkg]: !validRange(peers[pkgName])
              ? `a range that semver does not understand: ${peers[pkgName]}. This range does not work with semver.satisfies or semver.intersects, which npm-check-updates relies on to determine peer dependency compatibility. Either this is a mistake in ${peerPkg}, or it relies on a new syntax that is not compatible with the semver package.`
              : peers[pkgName],
          }),
          {} as Index<string>,
        )
      if (Object.keys(reason).length === 0) {
        const peersOfPkg = upgradedPeerDependenciesLatest?.[pkgName] || {}
        reason = Object.entries(peersOfPkg)
          .filter(
            ([peer, peerSpec]) =>
              upgradedPackagesWithPeerRestriction[peer] &&
              !(!validRange(peerSpec) || intersects(upgradedPackagesWithPeerRestriction[peer], peerSpec)),
          )
          .reduce(
            (accumReason, [peerPkg, peerSpec]) => ({ ...accumReason, [pkgName]: `${peerPkg} ${peerSpec}` }),
            {} as Index<string>,
          )
      }
      return {
        ...accum,
        [pkgName]: {
          from: current[pkgName],
          to: newVersion,
          reason,
        },
      }
    }, {} as Index<IgnoredUpgradeDueToPeerDeps>)
}

export default getIgnoredUpgradesDueToPeerDeps
