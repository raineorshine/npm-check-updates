import fs from 'fs/promises'
import globby from 'globby'
import path from 'path'
import untildify from 'untildify'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import chalk from './chalk'
import findPackage from './findPackage'
import getPackageFileName from './getPackageFileName'
import programError from './programError'

/**
 * Gets all workspace filenames, or just the root workspace package file
 *
 * NOTE: this has been refactored out of index.ts
 *
 * @param options the application options, used to determine which packages to return.
 * @returns tuple(pkgs, workspaces) containing the pkgs and workspace string arrays
 */
async function getAllPackages(options: Options): Promise<[string[], string[]]> {
  const defaultPackageFilename = getPackageFileName(options)

  // Workspace package names
  // These will be used to filter out local workspace packages so they are not fetched from the registry.
  let workspacePackages: string[] = []

  // Find the package file with globby.
  // When in workspaces mode, only include the root project package file when --root is used.
  let pkgs: string[] =
    (!options.workspaces && !options.workspace?.length) || options.root
      ? globby.sync(
          options.cwd
            ? path.resolve(untildify(options.cwd), defaultPackageFilename).replace(/\\/g, '/') // convert Windows path to *nix path for globby
            : defaultPackageFilename,
          {
            ignore: ['**/node_modules/**'],
          },
        )
      : []

  // workspaces
  if (options.workspaces || options.workspace?.length) {
    // use silent, otherwise there will be a duplicate "Checking" message
    const [pkgData] = await findPackage({ ...options, packageFile: defaultPackageFilename, loglevel: 'silent' })
    // FIXME: the next line suggests a typing bug.
    const pkgDataParsed =
      typeof pkgData === 'string' ? (JSON.parse(pkgData) as PackageFile) : /* c8 ignore next */ (pkgData as PackageFile)
    const workspaces = Array.isArray(pkgDataParsed.workspaces)
      ? pkgDataParsed.workspaces
      : pkgDataParsed.workspaces?.packages

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
    const workspacePackageGlob: string[] = (workspaces || []).map(workspace =>
      path
        .join(workspace, defaultPackageFilename)
        // convert Windows path to *nix path for globby
        .replace(/\\/g, '/'),
    )

    // e.g. [packages/a/package.json, ...]
    const workspacePackageFiles: string[] = [
      ...globby.sync(workspacePackageGlob, {
        ignore: ['**/node_modules/**'],
      }),
    ]
    // Get the package names from the package files.
    // If a package does not have a name, use the folder name.
    // These will be used to filter out local workspace packages so they are not fetched from the registry.
    workspacePackages = await Promise.all(
      workspacePackageFiles.map(async (file: string): Promise<string> => {
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
            options.workspace?.some(workspace =>
              workspaces?.some(
                workspacePattern =>
                  pkgFile === path.join(path.dirname(workspacePattern), workspace, defaultPackageFilename),
              ),
            ),
          )),
    ]
  }

  return [pkgs, workspacePackages]
}

export default getAllPackages
