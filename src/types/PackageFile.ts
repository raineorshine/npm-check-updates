import { Index } from './IndexType'
import { PackageFileRepository } from './PackageFileRepository'
import { VersionSpec } from './VersionSpec'

/** The relevant bits of a parsed package.json file. */
export interface PackageFile {
  engines?: Index<VersionSpec>
  repository?: string | PackageFileRepository
  dependencies?: Index<VersionSpec>
  devDependencies?: Index<VersionSpec>
  peerDependencies?: Index<VersionSpec>
  optionalDependencies?: Index<VersionSpec>
  bundleDependencies?: Index<VersionSpec>
  workspaces?: string[] | { packages: string[] }
}
