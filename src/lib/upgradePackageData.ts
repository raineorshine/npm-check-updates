import fs from 'fs/promises'
import yaml from 'js-yaml'
import path from 'path'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { VersionSpec } from '../types/VersionSpec'
import resolveDepSections from './resolveDepSections'
import upgradeCatalogData from './upgradeCatalogData'

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

    // Handle pnpm-workspace.yaml catalog files
    if (
      fileName === 'pnpm-workspace.yaml' ||
      (fileName.includes('catalog') && (fileExtension === '.yaml' || fileExtension === '.yml'))
    ) {
      // Check if we have synthetic catalog data (JSON with only dependencies and name/version)
      // In this case, we should generate the proper catalog structure
      const parsed = JSON.parse(pkgData)
      if (parsed.name === 'catalog-dependencies' && parsed.dependencies && Object.keys(parsed).length <= 3) {
        // This is synthetic catalog data, we need to generate the proper catalog structure
        // Read the original pnpm-workspace.yaml to get the catalog structure
        const yamlContent = await fs.readFile(pkgFile, 'utf-8')
        const yamlData = yaml.load(yamlContent) as any

        // Update catalog dependencies with upgraded versions
        if (yamlData.catalogs) {
          yamlData.catalogs = Object.entries(yamlData.catalogs as Record<string, Record<string, string>>).reduce(
            (catalogs, [catalogName, catalog]) => ({
              ...catalogs,
              [catalogName]: {
                ...catalog,
                ...Object.entries(upgraded)
                  .filter(([dep]) => catalog[dep])
                  .reduce((acc, [dep, version]) => ({ ...acc, [dep]: version }), {} as Record<string, string>),
              },
            }),
            {} as Record<string, Record<string, string>>,
          )
        }

        // Also handle single catalog (if present)
        if (yamlData.catalog) {
          const catalog = yamlData.catalog as Record<string, string>
          yamlData.catalog = {
            ...catalog,
            ...Object.entries(upgraded)
              .filter(([dep]) => catalog[dep])
              .reduce((acc, [dep, version]) => ({ ...acc, [dep]: version }), {} as Record<string, string>),
          }
        }

        // For pnpm, also expose the 'default' catalog as a top-level 'catalog' property
        if (yamlData.catalogs && yamlData.catalogs.default) {
          yamlData.catalog = yamlData.catalogs.default
        }

        return JSON.stringify(yamlData, null, 2)
      }

      return upgradeCatalogData(pkgFile, current, upgraded)
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
        return upgradeCatalogData(pkgFile, current, upgraded)
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
