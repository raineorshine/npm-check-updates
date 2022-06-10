import { Index } from './IndexType'
import { RunOptions } from './RunOptions'
import { VersionSpec } from './VersionSpec'
import { TargetDistTag } from './Target';

/** Internal, normalized options for all ncu behavior. Includes RunOptions that are specified in the CLI or passed to the ncu module, as well as meta information including CLI arguments, package information, and ncurc config. */
export type Options = RunOptions & {
  args?: any[]
  cli?: boolean
  distTag?: TargetDistTag
  json?: boolean
  nodeEngineVersion?: VersionSpec
  packageData?: string
  peerDependencies?: Index<any>
  rcConfigPath?: string
}
