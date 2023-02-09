import packageManagers from '../package-managers'
import { Maybe } from '../types/Maybe'
import { PackageManager } from '../types/PackageManager'

/**
 * Resolves the package manager from a string or object. Throws an error if an invalid packageManager is provided.
 *
 * @param packageManagerNameOrObject
 * @param packageManagerNameOrObject.global
 * @param packageManagerNameOrObject.packageManager
 * @returns
 */
function getPackageManager(name: Maybe<string>): PackageManager {
  // default to npm
  if (!name) {
    return packageManagers.npm
  }

  if (!packageManagers[name]) {
    throw new Error(`Invalid package manager: ${name}`)
  }

  return packageManagers[name]
}

export default getPackageManager
