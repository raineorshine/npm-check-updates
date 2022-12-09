import fs from 'fs/promises'
import globby from 'globby'
import path from 'path'
import untildify from 'untildify'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import chalk from './chalk'
import findPackage from './findPackage'
import programError from './programError'

/**
 * Gets all workspace filenames, or just the root workspace package file
 *
 * @param options the application options, used to determine which packages to return.
 * @returns tuple(pkgs, workspaces) containing the pkgs and workspace string arrays
 */
async function getAllPackages(options: Options): Promise<[string[], string[]]> {
  const cwd = options.cwd ? untildify(options.cwd) : './'
  const rootPackageFile = options.packageFile || (options.cwd ? path.join(cwd, 'package.json') : 'package.json')

  // Workspace package names
  // These will be used to filter out local workspace packages so they are not fetched from the registry.
  let workspacePackages: string[] = []

  // Find the package file with globby.
  // When in workspaces mode, only include the root project package file when --root is used.
  let pkgs =
    (!options.workspaces && !options.workspace?.length) || options.root
      ? // convert Windows path to *nix path for globby
        globby.sync(rootPackageFile.replace(/\\/g, '/'), { ignore: ['**/node_modules/**'] })
      : []

  // workspaces
  if (options.workspaces || options.workspace?.length) {
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
    const workspacePackageFiles = [
      ...globby.sync(workspacePackageGlob, {
        ignore: ['**/node_modules/**'],
      }),
    ]

    // Get the package names from the package files.
    // If a package does not have a name, use the folder name.
    // These will be used to filter out local workspace packages so they are not fetched from the registry.
    workspacePackages = await Promise.all(
      workspacePackageFiles.map(async file => {
        const packageFile = await fs.readFile(file, 'utf-8')
        const pkg: PackageFile = JSON.parse(packageFile)
        return pkg.name || file.split('/').slice(-2)[0]
      }),
    )

    // add workspace packages
    pkgs = [
      ...pkgs,
      ...(options.workspaces
        ? // --workspaces
          workspacePackageFiles
        : // --workspace
          workspacePackageFiles.filter(pkgFile =>
            /* ignore coverage on optional-chaining */
            /* c8 ignore next */
            options.workspace?.some(workspace =>
              /* ignore coverage on optional-chaining */
              /* c8 ignore next */
              workspaces?.some(
                workspacePattern =>
                  // convert Windows path to *nix path for filtering
                  pkgFile ===
                  path.join(cwd, path.dirname(workspacePattern), workspace, 'package.json').replace(/\\/g, '/'),
              ),
            ),
          )),
    ]
  }

  return [pkgs, workspacePackages]
}

export default getAllPackages
