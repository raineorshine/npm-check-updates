import { type Cacher } from './Cacher.ts'
import { type Index } from './IndexType.ts'
import { type RunOptions } from './RunOptions.ts'
import { type VersionSpec } from './VersionSpec.ts'

/** Internal, normalized options for all ncu behavior. Includes RunOptions that are specified in the CLI or passed to the ncu module, as well as meta information including CLI arguments, package information, and ncurc config. */
export type Options = RunOptions & {
  args?: any[]
  raw?: Partial<Record<keyof RunOptions, any>>
  // Long names of options that were explicitly set on the command line (or passed to the ncu module).
  // Used to keep them ahead of per-package .ncurc configs reloaded in --deep mode.
  cliKeys?: string[]
  cacher?: Cacher
  cli?: boolean
  distTag?: string
  json?: boolean
  nodeEngineVersion?: VersionSpec
  packageData?: string
  peerDependencies?: Index<any>
  rcConfigPath?: string
  // A list of local workspace packages by name.
  // This is used to ignore local workspace packages when fetching new versions.
  workspacePackages?: string[]
}
