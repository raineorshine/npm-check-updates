import { Index } from './IndexType.js'
import { Version } from './Version.js'

/** A pacote packument result object. */
export interface Packument {
  name: string
  deprecated?: boolean
  'dist-tags': Index<Version>
  engines: {
    node: string
  }
  // fullMetadata only
  // TODO: store only the time of the latest version?
  time?: Index<string>
  version: Version
  versions: Index<
    Packument & {
      _npmUser?: {
        name: string
      }
    }
  >
}
