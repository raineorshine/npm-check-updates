import { Index } from './IndexType'
import { Version } from './Version'

/** An object that represents an upgrade that was ignored, along with the reason. */
export interface IgnoredUpgrade {
  from: Version
  to: Version
  reason: Index<string>
}
