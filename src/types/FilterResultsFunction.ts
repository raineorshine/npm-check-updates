import { type SemVer } from 'semver-utils'
import { type Version } from './Version.ts'
import { type VersionSpec } from './VersionSpec.ts'

export type FilterResultsFunction = (
  packageName: string,
  versioningMetadata: {
    currentVersion: VersionSpec
    currentVersionSemver: SemVer[]
    upgradedVersion: Version
    upgradedVersionSemver: SemVer
  },
) => boolean
