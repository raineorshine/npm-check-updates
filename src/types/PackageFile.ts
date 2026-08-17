import { type Index } from './IndexType.ts'
import { type PackageFileRepository } from './PackageFileRepository.ts'
import { type VersionSpec } from './VersionSpec.ts'

type NestedVersionSpecs = {
  [name: string]: VersionSpec | NestedVersionSpecs
}

/** A single devEngines constraint. */
export interface DevEngineDependency {
  name: string
  version?: VersionSpec
  onFail?: 'ignore' | 'warn' | 'error' | 'download'
}

/** https://docs.npmjs.com/cli/configuring-npm/package-json#devengines */
export interface DevEngines {
  cpu?: DevEngineDependency | DevEngineDependency[]
  libc?: DevEngineDependency | DevEngineDependency[]
  os?: DevEngineDependency | DevEngineDependency[]
  packageManager?: DevEngineDependency | DevEngineDependency[]
  runtime?: DevEngineDependency | DevEngineDependency[]
}

/** The relevant bits of a parsed package.json file. */
export interface PackageFile {
  dependencies?: Index<VersionSpec>
  devDependencies?: Index<VersionSpec>
  devEngines?: DevEngines
  // deno only
  imports?: Index<VersionSpec>
  engines?: Index<VersionSpec>
  homepage?: string
  name?: string
  // https://nodejs.org/api/packages.html#packagemanager
  packageManager?: string
  optionalDependencies?: Index<VersionSpec>
  overrides?: NestedVersionSpecs
  peerDependencies?: Index<VersionSpec>
  repository?: string | PackageFileRepository
  scripts?: Index<string>
  workspaces?: string[] | { packages: string[] }
  version?: string
}
