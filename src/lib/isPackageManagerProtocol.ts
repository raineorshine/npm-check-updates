import { type VersionSpec } from '../types/VersionSpec.ts'

/**
 * Returns true if the spec uses a package manager protocol that references something
 * other than a registry version (e.g. `file:` or pnpm's `catalog:`).
 */
function isPackageManagerProtocol(spec: VersionSpec): boolean {
  return ['file:', 'link:', 'workspace:', 'catalog:', 'portal:'].some(prefix => spec.startsWith(prefix))
}

export default isPackageManagerProtocol
