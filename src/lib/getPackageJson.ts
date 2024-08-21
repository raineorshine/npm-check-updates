import fs from 'fs/promises'
import path from 'path'
import { PackageFile } from '../types/PackageFile'
import exists from './exists'

/** Gets the package.json contents of an installed package. */
async function getPackageJson(
  packageName: string,
  {
    pkgFile,
  }: {
    /** Specify the package file location to add to the node_modules search paths. Needed in workspaces/deep mode. */
    pkgFile?: string
  } = {},
): Promise<PackageFile | null> {
  const requirePaths = require.resolve.paths(packageName) || []
  const pkgFileNodeModules = pkgFile ? [path.join(path.dirname(pkgFile), 'node_modules')] : []
  const localNodeModules = [path.join(process.cwd(), 'node_modules')]
  const nodeModulePaths = [...pkgFileNodeModules, ...localNodeModules, ...requirePaths]

  for (const basePath of nodeModulePaths) {
    const packageJsonPath = path.join(basePath, packageName, 'package.json')
    if (await exists(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
        return packageJson
      } catch (e) {}
    }
  }

  return null
}

export default getPackageJson
