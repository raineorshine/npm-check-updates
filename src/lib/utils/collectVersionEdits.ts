import { type Index } from '../../types/IndexType.ts'
import { type VersionSpec } from '../../types/VersionSpec.ts'
import { type JsonValueEdit } from './applyJsonValueEdits.ts'

/**
 * Walks a parsed JSON value recursively and collects version edits for every dependency key that is
 * being upgraded, so keys nested to any depth (e.g. overrides, catalogs) are found. A dep with a
 * string value is replaced directly; a dep whose value is an override object has its self-reference
 * ("." key) replaced.
 */
export default function collectVersionEdits(
  node: unknown,
  nodePath: (string | number)[],
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
): JsonValueEdit[] {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return []

  const edits: JsonValueEdit[] = []

  for (const [key, value] of Object.entries(node)) {
    if (key in upgraded) {
      if (typeof value === 'string' && value === current[key]) {
        edits.push({ path: [...nodePath, key], value: upgraded[key] })
      } else if (value && typeof value === 'object' && !Array.isArray(value) && value['.'] === current[key]) {
        edits.push({ path: [...nodePath, key, '.'], value: upgraded[key] })
      }
    }

    edits.push(...collectVersionEdits(value, [...nodePath, key], current, upgraded))
  }

  return edits
}
