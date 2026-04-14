import { type SemVer } from 'semver-utils'
import { type UpgradeGroup } from './UpgradeGroup'

/** Customize how packages are divided into groups when using `--format group`. Run "ncu --help --groupFunction" for details. */
export type GroupFunction = (
  packageName: string,
  defaultGroup: UpgradeGroup,
  currentVersionSpec: SemVer[],
  upgradedVersionSpec: SemVer[],
  upgradedVersion: SemVer | null,
) => UpgradeGroup | string
