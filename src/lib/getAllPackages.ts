import fs from 'fs/promises'
import globby from 'globby'
import path from 'path'
import untildify from 'untildify'
import yaml from 'yaml'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { PackageInfo } from '../types/PackageInfo'
import findPackage from './findPackage'
import loadPackageInfoFromFile from './loadPackageInfoFromFile'
import programError from './programError'

/** Reads, parses, and resolves workspaces from a pnpm-workspace file at the same path as the package file. */
const readPnpmWorkspaces = async (pkgPath: string): Promise<string[] | { packages: string[] } | null> => {
  const pnpmWorkspacesPath = path.join(path.dirname(pkgPath), 'pnpm-workspace.yaml')
  let pnpmWorkspaceFile: string
  try {
    pnpmWorkspaceFile = await fs.readFile(pnpmWorkspacesPath, 'utf-8')
  } catch (e) {
    return null
  }
  return yaml.parse(pnpmWorkspaceFile)
}

/**
 * Gets all workspace sub-package information
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
  // use silent, otherwise there will be a duplicate "Checking" message
  const { pkgData, pkgPath } = await findPackage({ ...options, packageFile: rootPackageFile, loglevel: 'silent' })
  const rootPkg: PackageFile = typeof pkgData === 'string' ? JSON.parse(pkgData) : pkgData

  const workspacesObject = rootPkg.workspaces || (await readPnpmWorkspaces(pkgPath || ''))
  const workspaces = Array.isArray(workspacesObject) ? workspacesObject : workspacesObject?.packages

  if (!workspaces) {
    programError(
      options,
      `workspaces property missing from package.json. --workspace${
        options.workspaces ? 's' : ''
      } only works when you specify a "workspaces" property in your package.json.`,
    )
  }

  // build a glob from the workspaces
  // FIXME: the following workspaces check is redundant
  /* c8 ignore next */
  const workspacePackageGlob: string[] = (workspaces || []).map(workspace =>
    path
      .join(cwd, workspace, 'package.json')
      // convert Windows path to *nix path for globby
      .replace(/\\/g, '/'),
  )

  // e.g. [packages/a/package.json, ...]
  const allWorkspacePackageFilepaths: string[] = [
    ...globby.sync(workspacePackageGlob, {
      ignore: ['**/node_modules/**'],
    }),
  ]

  // Get the package names from the package files.
  // If a package does not have a name, use the folder name.
  // These will be used to filter out local workspace packages so they are not fetched from the registry.
  const allWorkspacePackageInfos: PackageInfo[] = [
    ...(await Promise.all(
      allWorkspacePackageFilepaths.map(async (filepath: string): Promise<PackageInfo> => {
        const info: PackageInfo = await loadPackageInfoFromFile(options, filepath)
        info.name = info.pkg.name || filepath.split('/').slice(-2)[0]
        return info
      }),
    )),
  ]

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
  const filteredWorkspacePackageInfos: PackageInfo[] = allWorkspacePackageInfos.filter((packageInfo: PackageInfo) =>
    /* ignore coverage on optional-chaining */
    /* c8 ignore next */
    options.workspace?.some((workspace: string) =>
      /* ignore coverage on optional-chaining */
      /* c8 ignore next */
      workspaces?.some(
        (workspacePattern: string) =>
          packageInfo.filepath ===
          path.join(cwd, path.dirname(workspacePattern), workspace, defaultPackageFilename).replace(/\\/g, '/'),
      ),
    ),
  )

  return [filteredWorkspacePackageInfos, allWorkspacePackageNames]
}

/**
 * Gets all workspace filenames, or just the root workspace package file
 *
 * NOTE: this has been refactored out of index.ts
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

  // Find the package file with globby.
  // When in workspaces mode, only include the root project package file when --root is used.
  const getBasePackageFile: boolean = !useWorkspaces || options.root === true
  if (getBasePackageFile) {
    // we are either:
    // * NOT a workspace
    // * a workspace and have requested an upgrade of the workspace-root
    const globPattern = rootPackageFile.replace(/\\/g, '/')
    const rootPackagePaths = globby.sync(globPattern, {
      ignore: ['**/node_modules/**'],
    })
    // realistically there should only be zero or one
    const rootPackages = [
      ...(await Promise.all(
        rootPackagePaths.map(
          async (packagePath: string): Promise<PackageInfo> => await loadPackageInfoFromFile(options, packagePath),
        ),
      )),
    ]
    packageInfos = [...packageInfos, ...rootPackages]
  }

  if (!useWorkspaces) {
    return [packageInfos, []]
  }

  // workspaces
  const [workspacePackageInfos, workspaceNames]: [PackageInfo[], string[]] = await getWorkspacePackageInfos(
    options,
    defaultPackageFilename,
    rootPackageFile,
    cwd,
  )
  packageInfos = [...packageInfos, ...workspacePackageInfos]
  return [packageInfos, workspaceNames]
}

export default getAllPackages
