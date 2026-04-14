import { type GetVersion } from './GetVersion'
import { type Index } from './IndexType'
import { type NpmConfig } from './NpmConfig'
import { type Options } from './Options'
import { type SpawnOptions } from './SpawnOptions'
import { type Version } from './Version'
import { type VersionSpec } from './VersionSpec'

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
