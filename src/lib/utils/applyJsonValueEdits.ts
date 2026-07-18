import { type Edit, applyEdits, findNodeAtLocation, parseTree } from 'jsonc-parser'

/** A string value replacement addressed by its JSON path, e.g. { path: ['dependencies', 'foo'], value: '2.0.0' }. */
export interface JsonValueEdit {
  path: (string | number)[]
  value: string
}

/**
 * Applies path->value replacements to JSON text via jsonc-parser, preserving the original formatting.
 * All edits are resolved against a single parse tree and applied in one pass. Paths that do not
 * resolve to a node are skipped.
 */
export default function applyJsonValueEdits(jsonText: string, valueEdits: JsonValueEdit[]): string {
  const tree = parseTree(jsonText)
  if (!tree) return jsonText

  const edits: Edit[] = []
  for (const { path, value } of valueEdits) {
    const node = findNodeAtLocation(tree, path)
    if (node) {
      edits.push({ offset: node.offset, length: node.length, content: JSON.stringify(value) })
    }
  }

  return applyEdits(jsonText, edits)
}
