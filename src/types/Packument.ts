import { Index } from './IndexType'
import { Version } from './Version'

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
    Omit<Packument, 'versions'> & {
      _npmUser?: {
        name: string
      }
    }
  >
}
