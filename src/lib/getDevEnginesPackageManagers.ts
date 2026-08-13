import { type DevEngineDependency, type PackageFile } from '../types/PackageFile.ts'

interface DevEnginesPackageManager {
  entry: DevEngineDependency
  /** JSON path of the entry, indexed only when devEngines.packageManager is an array. */
  path: (string | number)[]
}

/** Returns the devEngines.packageManager declarations, which may be a single object or an array. Entries without a name or version are skipped. */
export default function getDevEnginesPackageManagers(pkg: PackageFile): DevEnginesPackageManager[] {
  const field = pkg.devEngines?.packageManager
  if (!field) return []

  const entries = Array.isArray(field) ? field : [field]
  const packageManagers: DevEnginesPackageManager[] = []
  for (const [i, entry] of entries.entries()) {
    if (!entry?.name || typeof entry.version !== 'string') continue
    packageManagers.push({
      entry,
      path: Array.isArray(field) ? ['devEngines', 'packageManager', i] : ['devEngines', 'packageManager'],
    })
  }

  return packageManagers
}
