import { minVersion, satisfies } from 'semver'
import { IgnoredUpgradeDueToEnginesNode } from '../types/IgnoredUpgradeDueToEnginesNode'
import { Index } from '../types/IndexType'
import { Maybe } from '../types/Maybe'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import getEnginesNodeFromRegistry from './getEnginesNodeFromRegistry'
import upgradePackageDefinitions from './upgradePackageDefinitions'

/** Checks if package.json min node version satisfies given package engine.node spec */
const satisfiesNodeEngine = (enginesNode: Maybe<VersionSpec>, optionsEnginesNodeMinVersion: Version) =>
  !enginesNode || satisfies(optionsEnginesNodeMinVersion, enginesNode)

/** Get all upgrades that are ignored due to incompatible engines.node. */
export async function getIgnoredUpgradesDueToEnginesNode(
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  options: Options = {},
) {
  if (!options.nodeEngineVersion) return {}
  const optionsEnginesNodeMinVersion = minVersion(options.nodeEngineVersion)?.version
  if (!optionsEnginesNodeMinVersion) return {}
  const [upgradedLatestVersions] = await upgradePackageDefinitions(current, {
    ...options,
    enginesNode: false,
    nodeEngineVersion: undefined,
    loglevel: 'silent',
  })
  const enginesNodes = await getEnginesNodeFromRegistry(upgradedLatestVersions, options)
  return Object.entries(upgradedLatestVersions)
    .filter(
      ([pkgName, newVersion]) =>
        upgraded[pkgName] !== newVersion && !satisfiesNodeEngine(enginesNodes[pkgName], optionsEnginesNodeMinVersion),
    )
    .reduce(
      (accum, [pkgName, newVersion]) => ({
        ...accum,
        [pkgName]: {
          from: current[pkgName],
          to: newVersion,
          enginesNode: enginesNodes[pkgName]!,
        },
      }),
      {} as Index<IgnoredUpgradeDueToEnginesNode>,
    )
}

export default getIgnoredUpgradesDueToEnginesNode
