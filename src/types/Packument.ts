import { Index } from './IndexType'
import { Version } from './Version'

/** A pacote packument result object. */
export interface Packument {
  name: string
  deprecated?: boolean
  engines: {
    node: string
  }
  time: Index<string>
  version: Version
  versions: Packument[]
}
