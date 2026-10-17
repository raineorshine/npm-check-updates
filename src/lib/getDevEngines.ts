import { type DevEngineDependency, type PackageFile } from '../types/PackageFile.ts'

/** Runtimes with a version source: node from nodejs.org, and bun and deno from their npm packages. */
const runtimes = new Set(['node', 'bun', 'deno'])

interface DevEngine {
  entry: DevEngineDependency
  /** JSON path of the entry, indexed only when the field is an array. */
  path: (string | number)[]
}

/** Returns the devEngines.packageManager and devEngines.runtime declarations, each of which may be a single object or an array. Entries without a name or version, and runtimes other than node, bun, and deno, are skipped. */
export default function getDevEngines(pkg: PackageFile): DevEngine[] {
  const devEngines: DevEngine[] = []
  for (const key of ['packageManager', 'runtime'] as const) {
    const field = pkg.devEngines?.[key]
    if (!field) continue

    const entries = Array.isArray(field) ? field : [field]
    for (const [i, entry] of entries.entries()) {
      if (!entry?.name || typeof entry.version !== 'string') continue
      if (key === 'runtime' && !runtimes.has(entry.name)) continue
      devEngines.push({
        entry,
        path: Array.isArray(field) ? ['devEngines', key, i] : ['devEngines', key],
      })
    }
  }

  return devEngines
}
