import { SemVer } from 'semver-utils'
import { UpgradeGroup } from '../version-util'

/** Supported function for the --group options. */
export type GroupFunction = (
  packageName: string,
  currentVersionSpec: SemVer[],
  upgradedVersionSpec: SemVer[],
  upgradedVersion: SemVer | null,
  defaultGroup: UpgradeGroup,
) => UpgradeGroup
