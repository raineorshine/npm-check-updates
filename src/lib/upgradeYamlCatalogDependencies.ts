import type { Document } from 'yaml'
import { CST, isCollection, isPair, isScalar, parseDocument } from 'yaml'
import { CatalogsConfig } from '../types/CatalogConfig'

type UpdateDependencyConfig = {
  path: string[] // e.g., ['catalogs', 'my-catalog', 'my-dep'] or ['catalog', 'my-dep']
  newValue: string // e.g., '^2.0.0'
}

/**
 * Change the scalar name and/or value of a collection item in a YAML document,
 * while keeping formatting consistent. Mutates the given document.
 */
function changeDependencyIn(
  document: Document,
  path: string[],
  { newName, newValue }: { newName?: string; newValue?: string },
): Document | null {
  const parentPath = path.slice(0, -1)
  const relevantItemKey = path.at(-1)

  const parentNode = document.getIn(parentPath)

  if (!parentNode || !isCollection(parentNode)) {
    return null
  }

  const relevantNode = parentNode.items.find(
    item => isPair(item) && isScalar(item.key) && item.key.value === relevantItemKey,
  )

  if (!relevantNode || !isPair(relevantNode)) {
    return null
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
      return null
    }
    CST.setScalarValue(relevantNode.srcToken.value, newValue)
  }

  return document
}

/**
 *
 */
export function updateYamlCatalogDependencies({
  fileContent,
  upgrade,
}: {
  fileContent: string
  upgrade: UpdateDependencyConfig
}): string | null {
  const { path } = upgrade

  if (!(path.length > 1) && path[0] !== 'catalog' && path[0] !== 'catalogs') {
    // logger.error(
    //   'No catalogName was found; this is likely an extraction error.',
    // );
    return null
  }

  const { newValue } = upgrade

  // logger.trace(
  //   `npm.updateYarnrcCatalogDependency(): ${depType}::${catalogName}.${depName} = ${newValue}`,
  // );

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
    parsedContents = CatalogsConfig.parse(document.toJSON())
  } catch (err) {
    // logger.debug({ err }, 'Could not parse yarnrc YAML file.');
    return null
  }

  const oldVersion =
    path[0] === 'catalog'
      ? parsedContents.catalog?.[path[1]]
      : parsedContents.catalogs?.[path[1]]
        ? parsedContents.catalogs?.[path[1]][path[2]]
        : undefined

  if (oldVersion === newValue) {
    // logger.trace('Version is already updated');
    return fileContent
  }

  const modifiedDocument = changeDependencyIn(document, path, {
    newValue,
    newName: upgrade.path.at(-1),
  })

  if (!modifiedDocument) {
    // Case where we are explicitly unable to substitute the key/value, for
    // example if the value was an alias.
    return null
  }

  return CST.stringify(modifiedDocument.contents!.srcToken!)
}
