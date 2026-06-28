import { type VersionSpec } from '../types/VersionSpec.ts'

/**
 * Returns true if the spec uses a package manager protocol that references something
 * other than a registry version (e.g. `file:` or pnpm's `catalog:`).
 */
function isPackageManagerProtocol(spec: VersionSpec): boolean {
  return (
    spec.startsWith('file:') ||
    spec.startsWith('link:') ||
    spec.startsWith('workspace:') ||
    spec.startsWith('catalog:') ||
    spec.startsWith('portal:')
  )
}

export default isPackageManagerProtocol
