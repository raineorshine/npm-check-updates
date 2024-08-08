import { minVersion, satisfies } from 'semver'
import { IgnoredUpgradeDueToEnginesNode } from '../types/IgnoredUpgradeDueToEnginesNode'
import { Index } from '../types/IndexType'
import { Maybe } from '../types/Maybe'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import getEnginesNodeFromRegistry from './getEnginesNodeFromRegistry'
import keyValueBy from './keyValueBy'
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
  const [upgradedLatestVersions, latestVersionResults] = await upgradePackageDefinitions(current, {
    ...options,
    enginesNode: false,
    nodeEngineVersion: undefined,
    loglevel: 'silent',
  })

  // Use the latest versions since getEnginesNodeFromRegistry requires exact versions.
  // Filter down to only the upgraded latest versions, as there is no point in checking the engines.node for packages that have been filtered out, e.g. by options.minimal or options.filterResults.
  const latestVersions = keyValueBy(latestVersionResults, (dep, result) =>
    upgradedLatestVersions[dep] && result?.version
      ? {
          [dep]: result.version,
        }
      : null,
  )
  const enginesNodes = await getEnginesNodeFromRegistry(latestVersions, options)
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
