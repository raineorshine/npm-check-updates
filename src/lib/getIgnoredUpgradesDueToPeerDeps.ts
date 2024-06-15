import { satisfies } from 'semver'
import { IgnoredUpgradeDueToPeerDeps } from '../types/IgnoredUpgradeDueToPeerDeps'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import upgradePackageDefinitions from './upgradePackageDefinitions'

/** Get all upgrades that are ignored due to incompatible peer dependencies. */
export async function getIgnoredUpgradesDueToPeerDeps(
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  upgradedPeerDependencies: Index<Index<Version>>,
  options: Options = {},
) {
  const [upgradedLatestVersions, latestVersionResults] = await upgradePackageDefinitions(current, {
    ...options,
    peer: false,
    peerDependencies: undefined,
    loglevel: 'silent',
  })

  return Object.entries(upgradedLatestVersions)
    .filter(([pkgName, newVersion]) => upgraded[pkgName] !== newVersion)
    .reduce(
      (accum, [pkgName, newVersion]) => ({
        ...accum,
        [pkgName]: {
          from: current[pkgName],
          to: newVersion,
          reason: Object.entries(upgradedPeerDependencies)
            .filter(
              ([, peers]) =>
                peers[pkgName] !== undefined &&
                latestVersionResults[pkgName]?.version &&
                !satisfies(latestVersionResults[pkgName].version!, peers[pkgName]),
            )
            .reduce(
              (accumReason, [peerPkg, peers]) => ({ ...accumReason, [peerPkg]: peers[pkgName] }),
              {} as Index<string>,
            ),
        },
      }),
      {} as Index<IgnoredUpgradeDueToPeerDeps>,
    )
}

export default getIgnoredUpgradesDueToPeerDeps
