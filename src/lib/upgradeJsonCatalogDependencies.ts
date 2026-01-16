import fs from 'fs/promises'
import { Index } from '../types/IndexType'
import { VersionSpec } from '../types/VersionSpec'

/**
 * @returns String safe for use in `new RegExp()`
 */
function escapeRegexp(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

/**
 * Upgrade catalog dependencies in a JSON file (e.g., package.json for Bun).
 */
export async function upgradeJsonCatalogDependencies(
  filePath: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
): Promise<string> {
  const fileContent = await fs.readFile(filePath, 'utf-8')

  // Use regex replacement to maintain JSON formatting
  return Object.entries(upgraded)
    .filter(([dep]) => current[dep])
    .reduce((content, [dep, newVersion]) => {
      const currentVersion = current[dep]

      // Match catalog and catalogs sections in JSON (both top-level and within workspaces)
      const catalogPattern = `("${escapeRegexp(dep)}"\\s*:\\s*")(${escapeRegexp(currentVersion)})(")`
      const catalogRegex = new RegExp(catalogPattern, 'g')

      return content.replace(catalogRegex, `$1${newVersion}$3`)
    }, fileContent)
}
