import fs from 'node:fs/promises'
import path from 'node:path'
import glob, { type Options as GlobOptions } from 'fast-glob'
import untildify from 'untildify'
import { parse as parseYaml } from 'yaml'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type PackageFile } from '../types/PackageFile.ts'
import { type PackageInfo } from '../types/PackageInfo.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import { catalogFileFor } from './catalogFile.ts'
import findPackage from './findPackage.ts'
import loadPackageInfoFromFile from './loadPackageInfoFromFile.ts'
import programError from './programError.ts'

type CatalogSections = { catalog?: Index<VersionSpec>; catalogs?: Index<Index<VersionSpec>> }

/** The shape of a package manager's catalog file (pnpm-workspace.yaml, .yarnrc.yml). */
type CatalogConfigFile = CatalogSections & {
  packages?: string[]
  workspaces?: string[] | (CatalogSections & { packages?: string[] })
}

type PnpmWorkspaces = string[] | CatalogConfigFile

const globOptions: GlobOptions = {
  ignore: ['**/node_modules/**', '**/.pnpm-store/**'],
}

/** Reads and parses a yaml file sitting next to the package file, or null if it does not exist. */
const readYamlSibling = async <T>(pkgPath: string, filename: string): Promise<T | null> => {
  let contents: string
  try {
    contents = await fs.readFile(path.join(path.dirname(pkgPath), filename), 'utf-8')
  } catch {
    return null
  }
  return parseYaml(contents)
}

/** Merges a config's singular `catalog` and plural `catalogs` sections into the accumulated dependencies. */
const assignCatalogs = (accum: Index<VersionSpec>, config: CatalogSections) => {
  if (config.catalog) {
    Object.assign(accum, config.catalog)
  }
  if (config.catalogs) {
    Object.assign(accum, ...Object.values(config.catalogs))
  }
}

/** Gets catalog dependencies from the package manager's catalog file and from the package file. */
const readCatalogDependencies = async (options: Options, pkgPath: string): Promise<Index<VersionSpec> | null> => {
  const catalogDependencies: Index<VersionSpec> = {}

  // Read from the package manager's own catalog file (pnpm-workspace.yaml, .yarnrc.yml)
  const catalogFile = catalogFileFor(options.packageManager)
  if (catalogFile) {
    const config = await readYamlSibling<CatalogConfigFile>(pkgPath, catalogFile)
    if (config && !Array.isArray(config)) {
      assignCatalogs(catalogDependencies, config)
      // Handle nested workspaces.catalog and workspaces.catalogs format
      if (config.workspaces && !Array.isArray(config.workspaces)) {
        assignCatalogs(catalogDependencies, config.workspaces)
      }
    }
  }

  // Read from package.json (for Bun and modern pnpm)
  const packageData: PackageFile &
    CatalogSections & { workspaces?: string[] | (CatalogSections & { packages?: string[] }) } = JSON.parse(
    await fs.readFile(pkgPath, 'utf-8'),
  )

  assignCatalogs(catalogDependencies, packageData)

  // Workspaces catalogs (Bun format)
  if (packageData.workspaces && !Array.isArray(packageData.workspaces)) {
    assignCatalogs(catalogDependencies, packageData.workspaces)
  }

  return Object.keys(catalogDependencies).length > 0 ? catalogDependencies : null
}

/**
 * Gets all workspace packages information.
 *
 * @param options the application options, used to determine which packages to return.
 * @param defaultPackageFilename the default package filename
 * @returns a list of PackageInfo objects, one for each workspace file
 */
async function getWorkspacePackageInfos(
  options: Options,
  defaultPackageFilename: string,
  rootPackageFile: string,
  cwd: string,
): Promise<[PackageInfo[], string[]]> {
  // use silent; otherwise, there will be a duplicate "Checking" message
  const { pkgData, pkgPath } = await findPackage({ ...options, packageFile: rootPackageFile, loglevel: 'silent' })
  const rootPkg: PackageFile = typeof pkgData === 'string' ? JSON.parse(pkgData) : pkgData

  const workspacesObject =
    rootPkg.workspaces || (await readYamlSibling<PnpmWorkspaces>(pkgPath || '', 'pnpm-workspace.yaml'))
  const workspaces = Array.isArray(workspacesObject) ? workspacesObject : workspacesObject?.packages

  if (!workspaces) {
    programError(
      options,
      `workspaces property missing from package.json. --workspace${
        options.workspaces ? 's' : ''
      } only works when you specify a "workspaces" property in your package.json.`,
    )
  }

  // when --packageFile is explicit, resolve workspaces relative to its directory
  const pkgDir = options.packageFile ? path.dirname(path.resolve(options.packageFile)) : cwd

  // build a glob from the workspaces
  // FIXME: the following workspaces check is redundant
  const workspacePackageGlob: string[] = (workspaces || []).map(workspace =>
    path
      .join(pkgDir, workspace, 'package.json')
      // convert Windows path to *nix path
      .replace(/\\/g, '/'),
  )

  // e.g. [packages/a/package.json, ...]
  const allWorkspacePackageFilepaths: string[] = await glob(workspacePackageGlob, globOptions)

  // Get the package names from the package files.
  // If a package does not have a name, use the folder name.
  // These will be used to filter out local workspace packages so they are not fetched from the registry.
  const allWorkspacePackageInfos: PackageInfo[] = await Promise.all(
    allWorkspacePackageFilepaths.map(async (filepath: string): Promise<PackageInfo> => {
      const info: PackageInfo = await loadPackageInfoFromFile(options, filepath)
      info.name = info.pkg.name || filepath.split('/').slice(-2)[0]
      return info
    }),
  )

  // Workspace package names
  // These will be used to filter out local workspace packages so they are not fetched from the registry.
  const allWorkspacePackageNames: string[] = allWorkspacePackageInfos.map(
    (packageInfo: PackageInfo): string => packageInfo.name || '',
  )

  const filterWorkspaces = options.workspaces !== true
  if (!filterWorkspaces) {
    // --workspaces
    return [allWorkspacePackageInfos, allWorkspacePackageNames]
  }

  // add workspace packages
  // --workspace
  const selectedWorkspacePackageInfos: PackageInfo[] = allWorkspacePackageInfos.filter((packageInfo: PackageInfo) =>
    options.workspace?.some((workspace: string) =>
      workspaces?.some(
        (workspacePattern: string) =>
          packageInfo.name === workspace ||
          packageInfo.filepath ===
            path.join(pkgDir, path.dirname(workspacePattern), workspace, defaultPackageFilename).replace(/\\/g, '/'),
      ),
    ),
  )
  return [selectedWorkspacePackageInfos, allWorkspacePackageNames]
}

/**
 * Gets catalog package info from pnpm-workspace.yaml or package.json.
 *
 * @param options the application options
 * @param pkgPath the package file path (already resolved)
 * @returns PackageInfo for catalog dependencies or null if no catalogs exist
 */
async function getCatalogPackageInfo(options: Options, pkgPath: string): Promise<PackageInfo | null> {
  if (!pkgPath) {
    return null
  }

  const catalogDependencies = await readCatalogDependencies(options, pkgPath)
  if (!catalogDependencies) {
    return null
  }

  // Create a synthetic package info for catalog dependencies
  const catalogPackageFile: PackageFile = {
    name: 'catalog-dependencies',
    version: '1.0.0',
    dependencies: catalogDependencies,
  }

  // pnpm and yarn declare catalogs in their own config file; for bun they live in the package file
  const catalogFile = catalogFileFor(options.packageManager)
  const catalogFilePath = catalogFile ? path.join(path.dirname(pkgPath), catalogFile) : pkgPath

  // Create synthetic file content that matches the synthetic PackageFile
  const syntheticFileContent = JSON.stringify(catalogPackageFile, null, 2)

  const catalogPackageInfo: PackageInfo = {
    filepath: catalogFilePath,
    pkg: catalogPackageFile,
    pkgFile: syntheticFileContent,
    name: 'catalogs',
    catalog: true,
  }

  return catalogPackageInfo
}

/**
 * Gets all local packages, including workspaces (depending on -w, -ws, and -root).
 *
 * @param options the application options, used to determine which packages to return.
 * @returns PackageInfo[] an array of all package infos to be considered for updating
 */
async function getAllPackages(options: Options): Promise<[PackageInfo[], string[]]> {
  const defaultPackageFilename = options.packageFile || 'package.json'
  const cwd = options.cwd ? untildify(options.cwd) : './'
  const rootPackageFile = options.packageFile || (options.cwd ? path.join(cwd, 'package.json') : 'package.json')

  const useWorkspaces: boolean =
    options.workspaces === true || (options.workspace !== undefined && options.workspace.length !== 0)

  let packageInfos: PackageInfo[] = []

  // Find the package file. When in workspaces mode, only include
  // the root project package file when --root is used.
  const getBasePackageFile: boolean = !useWorkspaces || options.root === true
  if (getBasePackageFile) {
    // we are either:
    // * NOT a workspace
    // * a workspace and have requested an upgrade of the workspace-root
    const globPattern = rootPackageFile.replace(/\\/g, '/')
    const rootPackagePaths = await glob(globPattern, globOptions)
    // realistically there should only be zero or one
    const rootPackages = await Promise.all(
      rootPackagePaths.map(
        async (packagePath: string): Promise<PackageInfo> => await loadPackageInfoFromFile(options, packagePath),
      ),
    )
    packageInfos = [...packageInfos, ...rootPackages]
  }

  if (!useWorkspaces) {
    return [packageInfos, []]
  }

  // Read catalog dependencies first so we can resolve references
  const { pkgPath: workspacePkgPath } = await findPackage({
    ...options,
    packageFile: rootPackageFile,
    loglevel: 'silent',
  })
  const catalogPackageInfo = workspacePkgPath ? await getCatalogPackageInfo(options, workspacePkgPath) : null

  // workspaces
  const [workspacePackageInfos, workspaceNames]: [PackageInfo[], string[]] = await getWorkspacePackageInfos(
    options,
    defaultPackageFilename,
    rootPackageFile,
    cwd,
  )

  // Don't resolve catalog references in workspace packages - leave them as "catalog:*"
  // Only the catalog definitions themselves should be updated
  packageInfos = [...packageInfos, ...workspacePackageInfos]

  // Add catalog package info for version checking (only if there are catalogs)
  if (catalogPackageInfo) {
    packageInfos = [...packageInfos, catalogPackageInfo]
  }

  return [packageInfos, workspaceNames]
}

export default getAllPackages
