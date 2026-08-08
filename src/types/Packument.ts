import { type Index } from './IndexType.ts'
import { type Version } from './Version.ts'

/** A packument result object from npm-registry-fetch. */
export interface Packument {
  name: string
  // Omitted from abbreviated packuments, so it has to be read from a version manifest
  _npmUser?: {
    name: string
  }
  deprecated?: boolean
  'dist-tags': Index<Version>
  engines: {
    node: string
  }
  // fullMetadata only
  // TODO: store only the time of the latest version?
  time?: Index<string>
  version: Version
  versions: Index<Omit<Packument, 'versions'>>
}
