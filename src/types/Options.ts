import { Cacher } from './Cacher'
import { Index } from './IndexType'
import { RunOptions } from './RunOptions'
import { VersionSpec } from './VersionSpec'

/** Internal, normalized options for all ncu behavior. Includes RunOptions that are specified in the CLI or passed to the ncu module, as well as meta information including CLI arguments, package information, and ncurc config. */
export type Options = RunOptions & {
  args?: any[]
  cacher?: Cacher
  cli?: boolean
  distTag?: string
  json?: boolean
  nodeEngineVersion?: VersionSpec
  packageData?: string
  peerDependencies?: Index<any>
  rcConfigPath?: string
}
