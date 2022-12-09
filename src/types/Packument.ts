import { Index } from './IndexType'
import { Version } from './Version'

/** A pacote packument result object. */
export interface Packument {
  name: string
  deprecated?: boolean
  engines: {
    node: string
  }
  // fullMetadata only
  time?: Index<string>
  version: Version
  versions: Packument[]
}
