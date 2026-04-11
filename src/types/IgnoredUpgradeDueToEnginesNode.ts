import { type Version } from './Version'
import { type VersionSpec } from './VersionSpec'

/** An object that represents an upgrade that was ignored due to mismatch of engines.node */
export interface IgnoredUpgradeDueToEnginesNode {
  from: Version
  to: Version
  enginesNode: VersionSpec
}
