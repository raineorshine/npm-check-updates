import { type Index } from './IndexType.ts'
import { type Version } from './Version.ts'

/** A packument result object from npm-registry-fetch. */
export interface Packument {
  name: string
  // The deprecation message. Only set on entries of `versions`
  deprecated?: string
  'dist-tags': Index<Version>
  engines: {
    node: string
  }
  // fullMetadata only
  // TODO: store only the time of the latest version?
  time?: Index<string>
  peerDependencies?: Index<Version>
  version: Version
  versions: Index<
    Omit<Packument, 'versions'> & {
      _npmUser?: {
        name: string
      }
    }
  >
}
