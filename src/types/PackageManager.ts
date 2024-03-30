import { GetVersion } from './GetVersion.js'
import { Index } from './IndexType.js'
import { Options } from './Options.js'
import { Version } from './Version.js'
import { VersionSpec } from './VersionSpec.js'

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
  getPeerDependencies?: (packageName: string, version: Version) => Promise<Index<Version>>
}
