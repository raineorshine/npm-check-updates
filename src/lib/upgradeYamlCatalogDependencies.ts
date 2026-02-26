import type { Document } from 'yaml'
import { CST, isCollection, isPair, isScalar, parseDocument } from 'yaml'
import { CatalogsConfig } from '../types/CatalogConfig'
import type { Options } from '../types/Options'
import programError from './programError'

type UpdateYamlCatalogDependenciesArgs = {
  fileContent: string
  upgrade: {
    path: string[] // e.g., ['catalogs', 'my-catalog', 'my-dep'] or ['catalog', 'my-dep']
    newValue: string // e.g., '^2.0.0'
  }
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
  const { path } = upgrade

  if (!(path.length > 1) && path[0] !== 'catalog' && path[0] !== 'catalogs') {
    return null
  }

  const { newValue } = upgrade

  let document: ReturnType<typeof parseDocument>
  let parsedContents: CatalogsConfig

  try {
    // In order to preserve the original formatting as much as possible, we want
    // manipulate the CST directly. Using the AST (the result of parseDocument)
    // does not guarantee that formatting would be the same after
    // stringification. However, the CST is more annoying to query for certain
    // values. Thus, we use both an annotated AST and a JS representation; the
    // former for manipulation, and the latter for querying/validation.
    document = parseDocument(fileContent, { keepSourceTokens: true })
  } catch (err) {
    throwYamlSyntaxError(err, { options, filePath })
  }

  if (document.errors.length > 0) {
    throwYamlSyntaxError(document.errors[0], { options, filePath })
  }

  try {
    parsedContents = CatalogsConfig.parse(document.toJSON())
  } catch {
    return null
  }

  const oldVersion =
    path[0] === 'catalog'
      ? parsedContents.catalog?.[path[1]]
      : parsedContents.catalogs?.[path[1]]
        ? parsedContents.catalogs?.[path[1]][path[2]]
        : undefined

  if (oldVersion === newValue) {
    return fileContent
  }

  const didModify = changeDependencyIn(document, path, {
    newValue,
    newName: upgrade.path.at(-1),
  })

  if (!didModify) {
    // Case where we are explicitly unable to substitute the key/value, for
    // example if the value was an alias.
    return null
  }

  return CST.stringify(document.contents!.srcToken!)
}
