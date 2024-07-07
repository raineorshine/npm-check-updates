import { Index } from './IndexType'
import { PackageFileRepository } from './PackageFileRepository'
import { VersionSpec } from './VersionSpec'

type NestedVersionSpecs = {
  [name: string]: VersionSpec | NestedVersionSpecs
}

/** The relevant bits of a parsed package.json file. */
export interface PackageFile {
  dependencies?: Index<VersionSpec>
  devDependencies?: Index<VersionSpec>
  // deno only
  imports?: Index<VersionSpec>
  engines?: Index<VersionSpec>
  name?: string
  // https://nodejs.org/api/packages.html#packagemanager
  packageManager?: string
  optionalDependencies?: Index<VersionSpec>
  overrides?: NestedVersionSpecs
  peerDependencies?: Index<VersionSpec>
  repository?: string | PackageFileRepository
  scripts?: Index<string>
  workspaces?: string[] | { packages: string[] }
}
