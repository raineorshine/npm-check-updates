import { PackageFile } from '../types/PackageFile'
import getPackageJson from './getPackageJson'

/**
 * @param packageName A package name as listed in package.json's dependencies list
 * @param packageJson Optional param to specify a object representation of a package.json file instead of loading from node_modules
 * @returns The package version or null if a version could not be determined
 */
async function getPackageVersion(
  packageName: string,
  packageJson?: PackageFile,
  {
    pkgFile,
  }: {
    /** Specify the package file location to add to the node_modules search paths. Needed in workspaces/deep mode. */
    pkgFile?: string
  } = {},
) {
  if (packageJson) {
    return packageJson.version
  }

  const loadedPackageJson = await getPackageJson(packageName, { pkgFile })
  return loadedPackageJson?.version ?? null
}

export default getPackageVersion
