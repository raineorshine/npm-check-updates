import { type GetVersion } from './GetVersion.ts'
import { type Index } from './IndexType.ts'
import { type NativeCooldown } from './NativeCooldown.ts'
import { type NpmConfig } from './NpmConfig.ts'
import { type NpmOptions } from './NpmOptions.ts'
import { type Options } from './Options.ts'
import { type SpawnOptions } from './SpawnOptions.ts'
import { type SpawnPleaseOptions } from './SpawnPleaseOptions.ts'
import { type SpawnResult } from './SpawnResult.ts'
import { type Version } from './Version.ts'
import { type VersionSpec } from './VersionSpec.ts'

/** The package manager API that ncu uses to fetch versions and meta information for packages. Includes npm and yarn, and others can be added as needed. */
export interface PackageManager {
  /** Spawns the package manager binary. Only defined for adapters backed by a real package manager. */
  spawn?: (
    args: string | string[],
    npmOptions?: NpmOptions,
    spawnPleaseOptions?: SpawnPleaseOptions,
    spawnOptions?: SpawnOptions,
  ) => Promise<SpawnResult>
  /**
   * True if the package manager installs a single dependency with `add` rather than
   * `install --no-save`, which means the install also writes to the package file.
   */
  usesAddCommand?: boolean
  /** Reads the package manager's own cooldown setting, used when --cooldown is not given. */
  getCooldown?: (options: Options) => Promise<NativeCooldown | null>
  defaultPrefix?: (options: Options) => Promise<string | undefined>
  list?: (options: Options) => Promise<Index<Version>>
  latest: GetVersion
  minor?: GetVersion
  newest?: GetVersion
  patch?: GetVersion
  greatest?: GetVersion
  semver?: GetVersion
  packageAuthorChanged?: (
    packageName: string,
    from: VersionSpec,
    to: VersionSpec,
    options?: Options,
  ) => Promise<boolean>
  getPeerDependencies?: (packageName: string, version: Version, spawnOptions: SpawnOptions) => Promise<Index<Version>>
  getDistTags?: (packageName: string, options: Options, npmConfigLocal?: NpmConfig) => Promise<Index<Version>>
  getEngines?: (
    packageName: string,
    version: Version,
    options: Options,
    npmConfigLocal?: NpmConfig,
  ) => Promise<Index<VersionSpec | undefined>>
}
