import { type GetVersion } from './GetVersion.ts'
import { type Index } from './IndexType.ts'
import { type NpmConfig } from './NpmConfig.ts'
import { type Options } from './Options.ts'
import { type SpawnOptions } from './SpawnOptions.ts'
import { type Version } from './Version.ts'
import { type VersionSpec } from './VersionSpec.ts'

/** The package manager API that ncu uses to fetch versions and meta information for packages. Includes npm and yarn, and others can be added as needed. */
export interface PackageManager {
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
  getEngines?: (
    packageName: string,
    version: Version,
    options: Options,
    npmConfigLocal?: NpmConfig,
  ) => Promise<Index<VersionSpec | undefined>>
}
