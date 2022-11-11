import { Index } from './IndexType'
import { PackageFileRepository } from './PackageFileRepository'
import { VersionSpec } from './VersionSpec'

/** The relevant bits of a parsed package.json file. */
export interface PackageFile {
  bundleDependencies?: Index<VersionSpec>
  dependencies?: Index<VersionSpec>
  devDependencies?: Index<VersionSpec>
  engines?: Index<VersionSpec>
  name?: string
  optionalDependencies?: Index<VersionSpec>
  peerDependencies?: Index<VersionSpec>
  repository?: string | PackageFileRepository
  workspaces?: string[] | { packages: string[] }
}
