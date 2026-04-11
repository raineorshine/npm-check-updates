import { type SemVer } from 'semver-utils'
import { type Version } from './Version'
import { type VersionSpec } from './VersionSpec'

export type FilterResultsFunction = (
  packageName: string,
  versioningMetadata: {
    currentVersion: VersionSpec
    currentVersionSemver: SemVer[]
    upgradedVersion: Version
    upgradedVersionSemver: SemVer
  },
) => boolean
