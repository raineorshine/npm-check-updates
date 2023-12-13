import { Index } from './IndexType.js'
import { Version } from './Version.js'

/** An object that represents an upgrade that was ignored, along with the reason. */
export interface IgnoredUpgrade {
  from: Version
  to: Version
  reason: Index<string>
}
