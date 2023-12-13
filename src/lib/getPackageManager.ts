import packageManagers from '../package-managers/index.js'
import { Maybe } from '../types/Maybe.js'
import { Options } from '../types/Options.js'
import { PackageManager } from '../types/PackageManager.js'
import programError from './programError.js'

/**
 * Resolves the package manager from a string or object. Throws an error if an invalid packageManager is provided.
 *
 * @param packageManagerNameOrObject
 * @param packageManagerNameOrObject.global
 * @param packageManagerNameOrObject.packageManager
 * @returns
 */
function getPackageManager(options: Options, name: Maybe<string>): PackageManager {
  // default to npm
  if (!name || name === 'deno') {
    return packageManagers.npm
  } else if (options.registryType === 'json') {
    return packageManagers.staticRegistry
  }

  if (!packageManagers[name]) {
    programError(options, `Invalid package manager: ${name}`)
  }

  return packageManagers[name]
}

export default getPackageManager
