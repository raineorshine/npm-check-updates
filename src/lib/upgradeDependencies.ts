import _ from 'lodash'
import cint from 'cint'
import { parseRange } from 'semver-utils'
import * as versionUtil from '../version-util'
import getPreferredWildcard from './getPreferredWildcard'
import isUpgradeable from './isUpgradeable'
import { Index, Options, Version, VersionSpec } from '../types'

interface MappedDependencies {
  current: VersionSpec,
  currentParsed: VersionSpec | null,
  latest: Version,
  latestParsed: Version | null,
}

/**
 * Upgrade a dependencies collection based on latest available versions. Supports npm aliases.
 *
 * @param currentDependencies current dependencies collection object
 * @param latestVersions latest available versions collection object
 * @param [options={}]
 * @returns upgraded dependency collection object
 */
function upgradeDependencies(currentDependencies: Index<VersionSpec>, latestVersions: Index<Version>, options: Options = {}): Index<VersionSpec> {
  // filter out dependencies with empty values
  currentDependencies = cint.filterObject(currentDependencies, (key, value) => !!value)

  // get the preferred wildcard and bind it to upgradeDependencyDeclaration
  const wildcard = getPreferredWildcard(currentDependencies) || versionUtil.DEFAULT_WILDCARD

  /** Upgrades a single dependency. */
  const upgradeDep = (current: VersionSpec, latest: Version) => versionUtil.upgradeDependencyDeclaration(current, latest, {
    wildcard,
    removeRange: options.removeRange
  })

  return _(currentDependencies)
    // only include packages for which a latest version was fetched
    .pickBy((current, packageName) => packageName in latestVersions)
    // unpack npm alias and git urls
    .mapValues((current: string, packageName: string) => {
      const latest = latestVersions[packageName]
      let currentParsed = null
      let latestParsed = null

      // parse npm alias
      if (versionUtil.isNpmAlias(current)) {
        currentParsed = versionUtil.parseNpmAlias(current)![1]
        latestParsed = versionUtil.parseNpmAlias(latest)![1]
      }

      // "branch" is also used for tags (refers to everything after the hash character)
      if (versionUtil.isGithubUrl(current)) {

        const currentTag = versionUtil.getGithubUrlTag(current)!
        const [currentSemver] = parseRange(currentTag)
        currentParsed = versionUtil.stringify(currentSemver)

        const latestTag = versionUtil.getGithubUrlTag(latest)!
        const [latestSemver] = parseRange(latestTag)
        latestParsed = versionUtil.stringify(latestSemver)
      }

      return { current, currentParsed, latest, latestParsed }
    })
    // pick the packages that are upgradeable
    .pickBy(({ current, currentParsed, latest, latestParsed }: any) =>
      isUpgradeable(currentParsed || current, latestParsed || latest)
    )
    // pack embedded versions: npm aliases and git urls
    .mapValues(({ current, currentParsed, latest, latestParsed }: MappedDependencies) => {
      const upgraded = upgradeDep(currentParsed || current, latestParsed || latest)
      return versionUtil.isNpmAlias(current) ? versionUtil.upgradeNpmAlias(current, upgraded)
        : versionUtil.isGithubUrl(current) ? versionUtil.upgradeGithubUrl(current, upgraded)
        : upgraded
    })
    // TODO: type
    .value() as unknown as Index<VersionSpec>
}

export default upgradeDependencies
