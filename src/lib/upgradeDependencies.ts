import { parseRange } from 'semver-utils'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import filterObject from './filterObject.ts'
import getPreferredWildcard from './getPreferredWildcard.ts'
import isUpgradeable from './isUpgradeable.ts'
import { pickBy } from './pick.ts'
import * as versionUtil from './version-util.ts'

interface UpgradeSpec {
  current: VersionSpec
  currentParsed: VersionSpec | null
  latest: Version
  latestParsed: Version | null
}

/**
 * Upgrade a dependencies collection based on latest available versions. Supports npm aliases.
 *
 * @param currentDependencies current dependencies collection object
 * @param latestVersions latest available versions collection object
 * @param [options={}]
 * @returns upgraded dependency collection object
 */
function upgradeDependencies(
  currentDependencies: Index<VersionSpec | null>,
  latestVersions: Index<Version>,
  options: Options = {},
): Index<VersionSpec> {
  const targetOption = options.target || 'latest'

  // filter out dependencies with empty values
  currentDependencies = filterObject(currentDependencies, (key, value) => !!value)

  // get the preferred wildcard and bind it to upgradeDependencyDeclaration
  const wildcard = getPreferredWildcard(currentDependencies) || versionUtil.DEFAULT_WILDCARD

  /** Upgrades a single dependency. */
  const upgradeDep = (current: VersionSpec, latest: Version) =>
    versionUtil.upgradeDependencyDeclaration(current, latest, {
      wildcard,
      removeRange: options.removeRange,
    })

  const pipeline: ((deps: any) => any)[] = [
    // only include packages for which a latest version was fetched
    (deps: Index<VersionSpec>): Index<VersionSpec> =>
      pickBy(deps, (current, packageName) => packageName in latestVersions),
    // unpack npm alias and git urls
    (deps: Index<VersionSpec>): Index<UpgradeSpec> => {
      const result: Index<UpgradeSpec> = {}
      for (const [packageName, current] of Object.entries(deps)) {
        const latest = latestVersions[packageName]
        let currentParsed = null
        let latestParsed = null

        // parse npm alias
        if (versionUtil.isNpmAlias(current)) {
          currentParsed = versionUtil.parseNpmAlias(current)![1]
        }
        if (versionUtil.isNpmAlias(latest)) {
          latestParsed = versionUtil.parseNpmAlias(latest)![1]
        }

        // "branch" is also used for tags (refers to everything after the hash character)
        if (versionUtil.isGitHubUrl(current)) {
          const currentTag = versionUtil.getGitHubUrlTag(current)!
          const [currentSemver] = parseRange(currentTag)
          currentParsed = versionUtil.stringify(currentSemver)
        }

        if (versionUtil.isGitHubUrl(latest)) {
          const latestTag = versionUtil.getGitHubUrlTag(latest)!
          const [latestSemver] = parseRange(latestTag)
          latestParsed = versionUtil.stringify(latestSemver)
        }

        result[packageName] = { current, currentParsed, latest, latestParsed }
      }
      return result
    },
    // pick the packages that are upgradeable
    (deps: Index<UpgradeSpec>): Index<UpgradeSpec> =>
      pickBy(deps, ({ current, currentParsed, latest, latestParsed }: UpgradeSpec, name) => {
        // allow downgrades from prereleases when explicit tag is given
        const downgrade: boolean =
          versionUtil.isPre(current) &&
          (typeof targetOption === 'string' ? targetOption : targetOption(name, parseRange(current))).startsWith('@')
        return isUpgradeable(currentParsed || current, latestParsed || latest, { downgrade })
      }),
    // pack embedded versions: npm aliases and git urls
    (deps: Index<UpgradeSpec>): Index<Version | null> => {
      const result: Index<Version | null> = {}
      for (const [packageName, { current, currentParsed, latest, latestParsed }] of Object.entries(deps)) {
        const upgraded = upgradeDep(currentParsed || current, latestParsed || latest)

        result[packageName] = versionUtil.isNpmAlias(current)
          ? versionUtil.upgradeNpmAlias(current, upgraded)
          : versionUtil.isGitHubUrl(current)
            ? versionUtil.upgradeGitHubUrl(current, upgraded)
            : upgraded
      }
      return result
    },
  ]

  let pipelineResult: any = currentDependencies as Index<VersionSpec>
  for (const fn of pipeline) {
    pipelineResult = fn(pipelineResult)
  }
  return pipelineResult
}

export default upgradeDependencies
