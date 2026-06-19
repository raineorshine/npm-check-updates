import { CST, Composer, type Document, Parser, isCollection, isPair, isScalar } from 'yaml'
import { type CatalogsConfig, parseCatalogsConfig } from '../types/CatalogConfig.ts'
import { type Options } from '../types/Options.ts'
import programError from './programError.ts'

type YamlCatalogUpgrade = {
  path: string[] // e.g., ['catalogs', 'my-catalog', 'my-dep'] or ['catalog', 'my-dep']
  newValue: string // e.g., '^2.0.0'
}

type UpdateYamlCatalogDependenciesArgs = {
  fileContent: string
  upgrade: YamlCatalogUpgrade
  options?: Options
  filePath?: string
}

/** Throws a user-facing error for invalid YAML syntax. */
function throwYamlSyntaxError(error: unknown, { options, filePath }: { options?: Options; filePath?: string }): never {
  const details = error instanceof Error ? error.message : String(error)
  const target = filePath ? ` in ${filePath}` : ''
  const message = `Invalid YAML syntax${target}. Unable to read catalog dependencies.\n${details}`

  if (options) {
    programError(options, message)
  }

  throw new Error(message)
}

/** Returns true if the path points into a catalog or catalogs section. */
function isCatalogPath(path: string[]): boolean {
  return path.length >= 2 && ['catalog', 'catalogs', 'workspaces'].includes(path[0])
}

/** Reads the version currently declared at a catalog path. */
function getCatalogVersion(config: CatalogsConfig, path: string[]): string | undefined {
  const nestedWorkspaces = config.workspaces && !Array.isArray(config.workspaces) ? config.workspaces : undefined

  return path[0] === 'catalog'
    ? config.catalog?.[path[1]]
    : path[0] === 'catalogs'
      ? config.catalogs?.[path[1]]?.[path[2]]
      : path[0] === 'workspaces' && path[1] === 'catalog'
        ? nestedWorkspaces?.catalog?.[path[2]]
        : path[0] === 'workspaces' && path[1] === 'catalogs'
          ? nestedWorkspaces?.catalogs?.[path[2]]?.[path[3]]
          : undefined
}

/**
 * Parses the YAML to CST tokens and composes the AST from those same tokens (keepSourceTokens), so the AST
 * nodes reference the original CST tokens. We manipulate via the AST for convenience, then stringify the whole
 * token stream. Stringifying document.contents alone would drop everything outside the top-level map (leading
 * blank lines, directives, pre-document comments).
 */
function parseYamlDocument(
  fileContent: string,
  { options, filePath }: { options?: Options; filePath?: string },
): { tokens: CST.Token[]; document: Document } {
  let tokens: CST.Token[]
  let document: Document | undefined

  try {
    tokens = [...new Parser().parse(fileContent)]
    document = [...new Composer({ keepSourceTokens: true }).compose(tokens)][0]
  } catch (err) {
    throwYamlSyntaxError(err, { options, filePath })
  }

  if (!document) {
    throwYamlSyntaxError(new Error('No YAML document found.'), { options, filePath })
  }

  if (document.errors.length > 0) {
    throwYamlSyntaxError(document.errors[0], { options, filePath })
  }

  return { tokens, document }
}

/**
 * Change the scalar name and/or value of a collection item in a YAML document,
 * while keeping formatting consistent. Mutates the given document.
 *
 * Returns true when all requested updates were applied. Returns false when an
 * update could not be applied. The document may still be partially mutated when
 * false is returned (e.g. `newName` succeeds before `newValue` fails).
 */
function changeDependencyIn(
  document: Document,
  path: string[],
  { newName, newValue }: { newName?: string; newValue?: string },
): boolean {
  const parentPath = path.slice(0, -1)
  const relevantItemKey = path.at(-1)

  const parentNode = document.getIn(parentPath)

  if (!parentNode || !isCollection(parentNode)) {
    return false
  }

  const relevantNode = parentNode.items.find(
    item => isPair(item) && isScalar(item.key) && item.key.value === relevantItemKey,
  )

  if (!relevantNode || !isPair(relevantNode)) {
    return false
  }

  if (newName) {
    /* the try..catch block above already throws if a key is an alias */
    CST.setScalarValue(relevantNode.srcToken!.key!, newName)
  }

  if (newValue) {
    // We only support scalar values when substituting. This explicitly avoids
    // substituting aliases, since those can be resolved from a shared location,
    // and replacing either the referrent anchor or the alias would be wrong in
    // the general case. We leave this up to the user, e.g. via a Regex custom
    // manager.
    if (!CST.isScalar(relevantNode.srcToken?.value)) {
      return false
    }
    CST.setScalarValue(relevantNode.srcToken.value, newValue)
  }

  return true
}

/**
 * Updates a dependency version in a PNPM/Yarn `catalog` or `catalogs` section.
 *
 * The function parses the YAML, validates it against `CatalogsConfig`, and
 * applies the change through CST tokens to preserve original formatting (such
 * as quotes, spacing, and comments) as much as possible.
 *
 * Returns the updated YAML string when the change succeeds. Returns the
 * original `fileContent` when the target dependency already has `newValue`.
 * Returns `null` when schema validation fails or when the target key/value
 * cannot be safely updated (for example, alias-based values). Throws on YAML
 * syntax errors and, when `options` is provided, reports them via
 * `programError`.
 */
export function updateYamlCatalogDependencies({
  fileContent,
  upgrade,
  options,
  filePath,
}: UpdateYamlCatalogDependenciesArgs): string | null {
  const { path, newValue } = upgrade

  // only catalog paths are supported, e.g. ['catalog', dep] or ['workspaces', 'catalogs', name, dep]
  if (!isCatalogPath(path)) {
    return null
  }

  const { tokens, document } = parseYamlDocument(fileContent, { options, filePath })

  let parsedContents: CatalogsConfig
  try {
    parsedContents = parseCatalogsConfig(document.toJSON())
  } catch {
    return null
  }

  if (getCatalogVersion(parsedContents, path) === newValue) {
    return fileContent
  }

  const didModify = changeDependencyIn(document, path, { newValue, newName: path.at(-1) })

  if (!didModify) {
    // Case where we are explicitly unable to substitute the key/value, for
    // example if the value was an alias.
    return null
  }

  return tokens.map(token => CST.stringify(token)).join('')
}

/**
 * Applies a batch of catalog upgrades to a YAML file, parsing and stringifying only once.
 *
 * Upgrades that cannot be applied (unsupported path, already at the target version, alias value)
 * are skipped. Returns the original `fileContent` when nothing was applied.
 */
export function updateYamlCatalogDependenciesAll({
  fileContent,
  upgrades,
  options,
  filePath,
}: {
  fileContent: string
  upgrades: YamlCatalogUpgrade[]
  options?: Options
  filePath?: string
}): string {
  if (upgrades.length === 0) return fileContent

  const { tokens, document } = parseYamlDocument(fileContent, { options, filePath })

  let parsedContents: CatalogsConfig
  try {
    parsedContents = parseCatalogsConfig(document.toJSON())
  } catch {
    return fileContent
  }

  let modified = false
  for (const { path, newValue } of upgrades) {
    if (!isCatalogPath(path)) continue
    if (getCatalogVersion(parsedContents, path) === newValue) continue
    if (changeDependencyIn(document, path, { newValue, newName: path.at(-1) })) {
      modified = true
    }
  }

  return modified ? tokens.map(token => CST.stringify(token)).join('') : fileContent
}
