import { type Index } from './IndexType'
import { type Version } from './Version'

/** An object that represents an upgrade that was ignored due to peer dependencies, along with the reason. */
export interface IgnoredUpgradeDueToPeerDeps {
  from: Version
  to: Version
  reason: Index<string>
}
