import fs from 'fs/promises'
import path from 'path'
import { Index } from '../types/IndexType'
import { VersionSpec } from '../types/VersionSpec'

/**
 * @returns String safe for use in `new RegExp()`
 */
function escapeRegexp(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

/**
 * Upgrade catalog dependencies in a YAML file (e.g., pnpm-workspace.yaml).
 */
async function upgradeYamlCatalogData(
  filePath: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
): Promise<string> {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  let newContent = fileContent

  // Use regex replacement to maintain original formatting
  Object.keys(upgraded).forEach(dep => {
    const currentVersion = current[dep]
    const newVersion = upgraded[dep]

    if (currentVersion && newVersion) {
      // Match both quoted and unquoted versions
      const quotedPattern = `(${escapeRegexp(dep)}\\s*:\\s*["'])(${escapeRegexp(currentVersion)})(["'])`
      const unquotedPattern = `(${escapeRegexp(dep)}\\s*:\\s*)(${escapeRegexp(currentVersion)})(\\s*(?:\\n|$))`

      const quotedRegex = new RegExp(quotedPattern, 'g')
      const unquotedRegex = new RegExp(unquotedPattern, 'g')

      newContent = newContent.replace(quotedRegex, `$1${newVersion}$3`)
      newContent = newContent.replace(unquotedRegex, `$1${newVersion}$3`)
    }
  })

  return newContent
}

/**
 * Upgrade catalog dependencies in a JSON file (e.g., package.json for Bun).
 */
async function upgradeJsonCatalogData(
  filePath: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
): Promise<string> {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  let newContent = fileContent

  // Use regex replacement to maintain JSON formatting
  Object.keys(upgraded).forEach(dep => {
    const currentVersion = current[dep]
    const newVersion = upgraded[dep]

    if (currentVersion && newVersion) {
      // Match catalog and catalogs sections in JSON (both top-level and within workspaces)
      const catalogPattern = `("${escapeRegexp(dep)}"\\s*:\\s*")(${escapeRegexp(currentVersion)})(")`
      const catalogRegex = new RegExp(catalogPattern, 'g')

      newContent = newContent.replace(catalogRegex, `$1${newVersion}$3`)
    }
  })

  return newContent
}

/**
 * Upgrade catalog dependencies in either YAML or JSON catalog files.
 * Supports pnpm-workspace.yaml (pnpm) and package.json (Bun) catalog formats.
 *
 * @param filePath The path to the catalog file (pnpm-workspace.yaml or package.json)
 * @param current Current catalog dependencies {package: range}
 * @param upgraded New catalog dependencies {package: range}
 * @returns The updated file content as utf8 text
 */
export async function upgradeCatalogData(
  filePath: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
): Promise<string> {
  const fileExtension = path.extname(filePath)

  if (fileExtension === '.yaml' || fileExtension === '.yml') {
    return upgradeYamlCatalogData(filePath, current, upgraded)
  } else if (fileExtension === '.json') {
    return upgradeJsonCatalogData(filePath, current, upgraded)
  } else {
    throw new Error(`Unsupported catalog file type: ${filePath}`)
  }
}

export default upgradeCatalogData
