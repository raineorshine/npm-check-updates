import fs from 'node:fs/promises'
import path from 'node:path'
import { parseDocument } from 'yaml'
import { type CatalogsConfig, parseCatalogsConfig } from '../types/CatalogConfig.ts'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type PackageFile } from '../types/PackageFile.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import { escapeRegExp } from './escapeRegExp.ts'
import { pickBy } from './pick.ts'
import resolveDepSections from './resolveDepSections.ts'
import upgradeDependencies from './upgradeDependencies.ts'
import { upgradeJsonCatalogDependencies } from './upgradeJsonCatalogDependencies.ts'
import { updateYamlCatalogDependencies } from './upgradeYamlCatalogDependencies.ts'
import parseJson from './utils/parseJson.ts'

/** Replaces the upgraded dependency versions inside a single section body (the text between the section braces). */
function replaceDepsInSection(body: string, current: Index<VersionSpec>, upgraded: Index<VersionSpec>): string {
  return Object.entries(upgraded).reduce((updatedSection, [dep]) => {
    const expression = `"${escapeRegExp(dep)}"\\s*:\\s*("|{\\s*"."\\s*:\\s*")(${escapeRegExp(current[dep])})"`
    const regExp = new RegExp(expression, 'g')
    return updatedSection.replace(regExp, (match, child) => `"${dep}${child ? `": ${child}` : ': '}${upgraded[dep]}"`)
  }, body)
}

/**
 * Replaces upgraded dependency versions within the given sections of raw package.json text.
 * Each section body is delimited by a brace-balanced scan so nested objects (e.g. overrides) are
 * not truncated at the first closing brace.
 *
 * A package that appears in more than one section is collapsed to a single (lowest) spec in
 * current/upgraded, so when latest versions are available the upgrade is recomputed per section
 * from that section's own spec. https://github.com/raineorshine/npm-check-updates/issues/1594
 */
function replaceDependencySections(
  pkgData: string,
  depSections: string[],
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  options: Options,
  latest?: Index<Version>,
): string {
  const parsed = latest ? parseJson<Record<string, unknown>>(pkgData) : undefined

  /** Returns the current/upgraded spec maps to use for a given section. */
  const specsForSection = (sectionName: string): [Index<VersionSpec>, Index<VersionSpec>] => {
    const sectionObj = parsed?.[sectionName]
    // overrides/packageManager and non-plain-object sections keep the collapsed current/upgraded specs
    const useSectionSpecs =
      latest &&
      sectionName !== 'overrides' &&
      sectionName !== 'packageManager' &&
      sectionObj &&
      typeof sectionObj === 'object' &&
      !Array.isArray(sectionObj) &&
      Object.values(sectionObj).every(spec => typeof spec === 'string')
    if (!useSectionSpecs) return [current, upgraded]
    const sectionCurrent = sectionObj as Index<VersionSpec>
    // recompute upgrades from this section's own specs, keeping only the chosen deps so filtered
    // deps are never reintroduced (latest is not filtered by filterResults/minimal)
    const sectionUpgraded = pickBy(upgradeDependencies(sectionCurrent, latest, options), (spec, dep) => dep in upgraded)
    return [sectionCurrent, sectionUpgraded]
  }

  const sectionHeaderRegExp = new RegExp(`"(${depSections.join(`|`)})"\\s*:\\s*\\{`, 'g')
  let result = ''
  let lastIndex = 0
  let headerMatch: RegExpExecArray | null

  while ((headerMatch = sectionHeaderRegExp.exec(pkgData)) !== null) {
    // scan from the opening brace to its matching close so nested objects (e.g. overrides) are
    // not truncated at the first closing brace
    const bodyStart = headerMatch.index + headerMatch[0].length
    let depth = 1
    let i = bodyStart
    for (; i < pkgData.length && depth > 0; i++) {
      if (pkgData[i] === '{') depth++
      else if (pkgData[i] === '}') depth--
    }

    const bodyEnd = i - 1
    const [sectionCurrent, sectionUpgraded] = specsForSection(headerMatch[1])
    result +=
      pkgData.slice(lastIndex, bodyStart) +
      replaceDepsInSection(pkgData.slice(bodyStart, bodyEnd), sectionCurrent, sectionUpgraded)
    lastIndex = bodyEnd
    sectionHeaderRegExp.lastIndex = bodyEnd
  }

  result += pkgData.slice(lastIndex)
  return result
}

/**
 * Upgrade the dependency declarations in the package data.
 *
 * @param pkgData The package.json data, as utf8 text
 * @param current Old dependencies {package: range}
 * @param upgraded New dependencies {package: range}
 * @param options Options object
 * @param pkgFile Optional path to the package file
 * @param latest Optional fetched latest versions {package: version}, used to upgrade a package that
 * appears in multiple sections with different specs correctly per section
 * @returns The updated package data, as utf8 text
 * @description Side Effect: prompts
 */
async function upgradePackageData(
  pkgData: string,
  current: Index<VersionSpec>,
  upgraded: Index<VersionSpec>,
  options: Options,
  pkgFile?: string,
  latest?: Index<Version>,
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
      const catalogData: CatalogsConfig = parseCatalogsConfig(parseDocument(yamlContent).toJSON())

      // Reconstruct the list of updates to apply unfortunately we lost the path information during extraction before
      const reconstructedUpdates: { path: string[]; newValue: string }[] = []

      if (catalogData.catalogs) {
        for (const [catalogName, catalog] of Object.entries(catalogData.catalogs)) {
          for (const [dep, version] of Object.entries(upgraded)) {
            if (catalog[dep]) {
              reconstructedUpdates.push({ path: ['catalogs', catalogName, dep], newValue: version })
            }
          }
        }
      }

      if (catalogData.catalog) {
        for (const [dep, version] of Object.entries(upgraded)) {
          if (catalogData.catalog?.[dep]) {
            reconstructedUpdates.push({ path: ['catalog', dep], newValue: version })
          }
        }
      }

      // Handle nested workspaces.catalog and workspaces.catalogs format
      const workspacesData = catalogData.workspaces
      if (workspacesData && !Array.isArray(workspacesData)) {
        if (workspacesData.catalogs) {
          for (const [catalogName, catalog] of Object.entries(workspacesData.catalogs)) {
            for (const [dep, version] of Object.entries(upgraded)) {
              if (catalog[dep]) {
                reconstructedUpdates.push({ path: ['workspaces', 'catalogs', catalogName, dep], newValue: version })
              }
            }
          }
        }
        if (workspacesData.catalog) {
          for (const [dep, version] of Object.entries(upgraded)) {
            if (workspacesData.catalog?.[dep]) {
              reconstructedUpdates.push({ path: ['workspaces', 'catalog', dep], newValue: version })
            }
          }
        }
      }

      let updatedContent = yamlContent
      for (const upgrade of reconstructedUpdates) {
        const updatedYaml = updateYamlCatalogDependencies({
          fileContent: updatedContent,
          upgrade,
          options,
          filePath: pkgFile,
        })
        if (updatedYaml) {
          updatedContent = updatedYaml
        }
      }

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

  let newPkgData = replaceDependencySections(pkgData, depSections, current, upgraded, options, latest)

  if (depSections.includes('packageManager')) {
    const pkg = parseJson(pkgData) as PackageFile
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
