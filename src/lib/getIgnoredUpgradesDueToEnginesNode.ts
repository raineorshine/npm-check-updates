import semver from 'semver'
import { type IgnoredUpgradeDueToEnginesNode } from '../types/IgnoredUpgradeDueToEnginesNode.ts'
import { type Index } from '../types/IndexType.ts'
import { type Maybe } from '../types/Maybe.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getEnginesNodeFromRegistry from './getEnginesNodeFromRegistry.ts'
import keyValueBy from './keyValueBy.ts'
import upgradePackageDefinitions from './upgradePackageDefinitions.ts'

/** Checks if package.json min node version satisfies given package engine.node spec. */
const satisfiesNodeEngine = (enginesNode: Maybe<VersionSpec>, optionsEnginesNodeMinVersion: Version) =>
  !enginesNode || semver.satisfies(optionsEnginesNodeMinVersion, enginesNode)

/** Get all upgrades that are ignored due to incompatible engines.node. */
export async function getIgnoredUpgradesDueToEnginesNode(
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  options: Options = {},
) {
  if (!options.nodeEngineVersion) return {}
  const optionsEnginesNodeMinVersion = semver.minVersion(options.nodeEngineVersion)?.version
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
  const ignored: Index<IgnoredUpgradeDueToEnginesNode> = {}

  for (const [pkgName, newVersion] of Object.entries(upgradedLatestVersions)) {
    if (upgraded[pkgName] === newVersion || satisfiesNodeEngine(enginesNodes[pkgName], optionsEnginesNodeMinVersion)) {
      continue
    }
    ignored[pkgName] = { from: current[pkgName], to: newVersion, enginesNode: enginesNodes[pkgName]! }
  }
  return ignored
}

export default getIgnoredUpgradesDueToEnginesNode
