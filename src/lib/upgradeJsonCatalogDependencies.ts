import fs from 'node:fs/promises'
import { type Index } from '../types/IndexType.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import { escapeRegExp } from './utils/escapeRegExp.ts'

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
  let content = fileContent
  for (const [dep, newVersion] of Object.entries(upgraded).filter(([dep]) => current[dep])) {
    const currentVersion = current[dep]

    // Match catalog and catalogs sections in JSON (both top-level and within workspaces)
    const catalogPattern = `("${escapeRegExp(dep)}"\\s*:\\s*")(${escapeRegExp(currentVersion)})(")`
    const catalogRegex = new RegExp(catalogPattern, 'g')

    content = content.replace(catalogRegex, `$1${newVersion}$3`)
  }
  return content
}
