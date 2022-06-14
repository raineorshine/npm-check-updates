import { GetVersion } from './GetVersion'
import { Index } from './IndexType'
import { Options } from './Options'
import { Version } from './Version'
import { VersionSpec } from './VersionSpec'

/** The package manager API that ncu uses to fetch versions and meta information for packages. Includes npm and yarn, and others can be added if needed. */
export interface PackageManager {
  defaultPrefix?: (options: Options) => Promise<string | undefined>
  list?: (options: Options) => Promise<Index<Version>>
  latest: GetVersion
  major?: GetVersion
  minor?: GetVersion
  newest?: GetVersion
  greatest?: GetVersion
  packageAuthorChanged?: (
    packageName: string,
    from: VersionSpec,
    to: VersionSpec,
    options?: Options,
  ) => Promise<boolean>
  getPeerDependencies?: (packageName: string, version: Version) => Promise<Index<Version>>
}
