import { satisfies } from 'semver'
import upgradePackageDefinitions from './upgradePackageDefinitions'
import { IgnoredUpgrade, Index, Options, Version, VersionSpec } from '../types'

/** Get all upgrades that are ignored due to incompatible peer dependencies. */
export async function getIgnoredUpgrades(current: Index<VersionSpec>, upgraded: Index<VersionSpec>, upgradedPeerDependencies: Index<Index<Version>>, options: Options = {}) {
  const [upgradedLatestVersions, latestVersions] = await upgradePackageDefinitions(
    current,
    { ...options, peer: false, peerDependencies: undefined, loglevel: 'silent' }
  )

  return Object.entries(upgradedLatestVersions)
    .filter(([pkgName, newVersion]) => upgraded[pkgName] !== newVersion)
    .reduce((accum, [pkgName, newVersion]) => ({
      ...accum,
      [pkgName]: {
        from: current[pkgName],
        to: newVersion,
        reason: Object.entries(upgradedPeerDependencies)
          .filter(([, peers]) => peers[pkgName] !== undefined && !satisfies(latestVersions[pkgName], peers[pkgName]))
          .reduce((accumReason, [peerPkg, peers]) => ({ ...accumReason, [peerPkg]: peers[pkgName] }), {} as Index<string>)
      }
    }), {} as Index<IgnoredUpgrade>)
}

export default getIgnoredUpgrades
