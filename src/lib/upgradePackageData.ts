import fs from 'fs/promises'
import path from 'path'
import { parseDocument } from 'yaml'
import { CatalogsConfig } from '../types/CatalogConfig'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { VersionSpec } from '../types/VersionSpec'
import resolveDepSections from './resolveDepSections'
import { upgradeJsonCatalogDependencies } from './upgradeJsonCatalogDependencies'
import { updateYamlCatalogDependencies } from './upgradeYamlCatalogDependencies'

/**
 * @returns String safe for use in `new RegExp()`
 */
function escapeRegexp(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') // Thanks Stack Overflow!
}

/**
 * Upgrade the dependency declarations in the package data.
 *
 * @param pkgData The package.json data, as utf8 text
 * @param oldDependencies Old dependencies {package: range}
 * @param newDependencies New dependencies {package: range}
 * @param options Options object
 * @param pkgFile Optional path to the package file
 * @returns The updated package data, as utf8 text
 * @description Side Effect: prompts
 */
async function upgradePackageData(
  pkgData: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  options: Options,
  pkgFile?: string,
) {
  // Check if this is a catalog file (pnpm-workspace.yaml or package.json with catalogs)
  if (pkgFile) {
    const fileName = path.basename(pkgFile)
    const fileExtension = path.extname(pkgFile)

    // Handle synthetic catalog files (package.json#catalog format)
    if (pkgFile.includes('#catalog')) {
      // This is a synthetic catalog file, we need to read and update the actual file
      const actualFilePath = pkgFile.replace('#catalog', '')
      const actualFileExtension = path.extname(actualFilePath)

      if (actualFileExtension === '.json') {
        // Bun format: update package.json catalogs and return the updated content
        return upgradeJsonCatalogDependencies(actualFilePath, current, upgraded)
      }
    }

    // Handle yaml catalog files
    if (fileName === 'pnpm-workspace.yaml' || fileName === '.yarnrc.yml') {
      const yamlContent = await fs.readFile(pkgFile, 'utf-8')
      const catalogData: CatalogsConfig = CatalogsConfig.parse(parseDocument(yamlContent).toJSON())

      // Reconstruct the list of updates to apply unfortunately we lost the path information during extraction before
      const reconstructedUpdates: { path: string[]; newValue: string }[] = []

      if (catalogData.catalogs) {
        Object.entries(catalogData.catalogs).forEach(([catalogName, catalog]) => {
          Object.entries(upgraded).forEach(([dep, version]) => {
            if (catalog[dep]) {
              reconstructedUpdates.push({ path: ['catalogs', catalogName, dep], newValue: version })
            }
          })
        })
      }

      if (catalogData.catalog) {
        Object.entries(upgraded).forEach(([dep, version]) => {
          if (catalogData.catalog?.[dep]) {
            reconstructedUpdates.push({ path: ['catalog', dep], newValue: version })
          }
        })
      }

      let updatedContent = yamlContent
      reconstructedUpdates.forEach(upgrade => {
        const updatedYaml = updateYamlCatalogDependencies({
          fileContent: updatedContent,
          upgrade,
        })
        if (updatedYaml) {
          updatedContent = updatedYaml
        }
      })

      return updatedContent
    }

    // Handle package.json catalog files (check if content contains catalog/catalogs at root level or in workspaces)
    if (fileExtension === '.json') {
      const parsed = JSON.parse(pkgData)
      const hasTopLevelCatalogs = parsed.catalog || parsed.catalogs
      const hasWorkspacesCatalogs =
        parsed.workspaces &&
        !Array.isArray(parsed.workspaces) &&
        (parsed.workspaces.catalog || parsed.workspaces.catalogs)

      if (hasTopLevelCatalogs || hasWorkspacesCatalogs) {
        return upgradeJsonCatalogDependencies(pkgFile, current, upgraded)
      }
    }
  }

  // Always include overrides since any upgraded dependencies needed to be upgraded in overrides as well.
  // https://github.com/raineorshine/npm-check-updates/issues/1332
  const depSections = [...resolveDepSections(options.dep), 'overrides']

  // iterate through each dependency section
  const sectionRegExp = new RegExp(`"(${depSections.join(`|`)})"s*:[^}]*`, 'g')
  let newPkgData = pkgData.replace(sectionRegExp, section => {
    // replace each upgraded dependency in the section
    return Object.entries(upgraded).reduce((updatedSection, [dep]) => {
      // const expression = `"${dep}"\\s*:\\s*"(${escapeRegexp(current[dep])})"`
      const expression = `"${dep}"\\s*:\\s*("|{\\s*"."\\s*:\\s*")(${escapeRegexp(current[dep])})"`
      const regExp = new RegExp(expression, 'g')
      return updatedSection.replace(regExp, (match, child) => `"${dep}${child ? `": ${child}` : ': '}${upgraded[dep]}"`)
    }, section)
  })

  if (depSections.includes('packageManager')) {
    const pkg = JSON.parse(pkgData) as PackageFile
    if (pkg.packageManager) {
      const [name] = pkg.packageManager.split('@')
      if (upgraded[name]) {
        newPkgData = newPkgData.replace(
          /"packageManager"\s*:\s*".*?@[^"]*"/,
          `"packageManager": "${name}@${upgraded[name]}"`,
        )
      }
    }
  }

  return newPkgData
}

export default upgradePackageData
