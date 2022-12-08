import globby from 'globby'
import path from 'path'
import untildify from 'untildify'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { PackageInfo, loadPackageInfoFromFile } from './PackageInfo'
import chalk from './chalk'
import findPackage from './findPackage'
import programError from './programError'

/**
 * Gets workspace sub-package information
 *
 * @param options the application options, used to determine which packages to return.
 * @param defaultPackageFilename the default package filename
 * @returns a tuple of list of package-files and workspace names
 */
async function getWorkspacePackages(
  options: Options,
  defaultPackageFilename: string,
  rootPackageFile: string,
  cwd: string,
): Promise<[string[], string[]]> {
  // use silent, otherwise there will be a duplicate "Checking" message
  const [pkgData] = await findPackage({ ...options, packageFile: rootPackageFile, loglevel: 'silent' })
  const rootPkg: PackageFile = typeof pkgData === 'string' ? JSON.parse(pkgData) : pkgData

  const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces?.packages

  if (!workspaces) {
    programError(
      options,
      chalk.red(
        `workspaces property missing from package.json. --workspace${
          options.workspaces ? 's' : ''
        } only works when you specify a "workspaces" property in your package.json.`,
      ),
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
        const info: PackageInfo = await loadPackageInfoFromFile(filepath)
        info.name = info.pkg.name || filepath.split('/').slice(-2)[0]
        return info
      }),
    )),
  ]

  // Workspace package names
  // These will be used to filter out local workspace packages so they are not fetched from the registry.
  const workspacePackageNames: string[] = allWorkspacePackageInfos.map(
    (packageInfo: PackageInfo): string => packageInfo.name || '',
  )

  // add workspace packages
  const workspacePackageFilepaths: string[] = options.workspaces
    ? // --workspaces
      allWorkspacePackageFilepaths
    : // --workspace
      allWorkspacePackageFilepaths.filter((pkgFilepath: string) =>
        /* ignore coverage on optional-chaining */
        /* c8 ignore next */
        options.workspace?.some(workspace =>
          /* ignore coverage on optional-chaining */
          /* c8 ignore next */
          workspaces?.some(
            workspacePattern =>
              pkgFilepath === path.join(cwd, path.dirname(workspacePattern), workspace, defaultPackageFilename),
          ),
        ),
      )
  return [workspacePackageFilepaths, workspacePackageNames]
}

/**
 * Gets all workspace filenames, or just the root workspace package file
 *
 * NOTE: this has been refactored out of index.ts
 *
 * @param options the application options, used to determine which packages to return.
 * @returns tuple(packageFilepaths, workspaces) containing the packageFilepaths and workspace string arrays
 */
async function getAllPackages(options: Options): Promise<[string[], string[]]> {
  const defaultPackageFilename = getPackageFileName(options)
  const cwd = options.cwd ? untildify(options.cwd) : './'
  const rootPackageFile = options.packageFile || (options.cwd ? path.join(cwd, 'package.json') : 'package.json')

  // workspaces
  const useWorkspaces = options.workspaces || options.workspace?.length

  // Find the package file with globby.
  // When in workspaces mode, only include the root project package file when --root is used.
  let packageFilepaths: string[] =
    !useWorkspaces || options.root
      ? // convert Windows path to *nix path for globby
        globby.sync(rootPackageFile.replace(/\\/g, '/'), { ignore: ['**/node_modules/**'] })
      : []

  if (!useWorkspaces) {
    return [packageFilepaths, []]
  }

  const [workspacePackageFilepaths, workspacePackageNames]: [string[], string[]] = await getWorkspacePackages(
    options,
    defaultPackageFilename,
    rootPackageFile,
    cwd,
  )
  packageFilepaths = [...packageFilepaths, ...workspacePackageFilepaths]

  return [packageFilepaths, workspacePackageNames]
}

export default getAllPackages
