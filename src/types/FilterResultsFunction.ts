import { SemVer } from 'semver-utils'
import { Version } from './Version.js'
import { VersionSpec } from './VersionSpec.js'

export type FilterResultsFunction = (
  packageName: string,
  versioningMetadata: {
    currentVersion: VersionSpec
    currentVersionSemver: SemVer[]
    upgradedVersion: Version
    upgradedVersionSemver: SemVer
  },
) => boolean
