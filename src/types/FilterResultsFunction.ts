import { SemVer } from 'semver-utils'
import { VersionSpec } from "./VersionSpec";
import { Version } from "./Version";

export type FilterResultsFunction = (
  packageName: string,
  versioningMetadata: {
    currentVersion: VersionSpec,
    currentVersionSemver: SemVer[],
    upgradedVersion: Version
  },
) => boolean
