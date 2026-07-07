import fs from 'node:fs/promises'
import { type Index } from '../types/IndexType.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import applyJsonValueEdits from './utils/applyJsonValueEdits.ts'
import collectVersionEdits from './utils/collectVersionEdits.ts'
import parseJson from './utils/parseJson.ts'

/**
 * Upgrade catalog dependencies in a JSON file (e.g., package.json for Bun).
 *
 * Walks the whole document so any matching dependency (catalog/catalogs entries as well as regular
 * dependency sections) is upgraded, and applies the edits via jsonc-parser so the original formatting
 * is preserved.
 */
export async function upgradeJsonCatalogDependencies(
  filePath: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
): Promise<string> {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  const parsed = parseJson(fileContent)
  return applyJsonValueEdits(fileContent, collectVersionEdits(parsed, [], current, upgraded))
}
