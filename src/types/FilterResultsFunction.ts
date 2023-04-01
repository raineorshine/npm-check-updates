import { SemVer } from 'semver-utils'
import { Version } from './Version'
import { VersionSpec } from './VersionSpec'

export type FilterResultsFunction = (
  packageName: string,
  versioningMetadata: {
    currentVersion: VersionSpec
    currentVersionSemver: SemVer[]
    upgradedVersion: Version
    upgradedVersionSemver: SemVer[]
  },
) => boolean
