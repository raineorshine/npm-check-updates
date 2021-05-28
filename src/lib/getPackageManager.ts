import packageManagers from '../package-managers'
import { Maybe, PackageManager } from '../types'

/**
 * Initialize the version manager with the given package manager.
 *
 * @param packageManagerNameOrObject
 * @param packageManagerNameOrObject.global
 * @param packageManagerNameOrObject.packageManager
 * @returns
 */
function getPackageManager(packageManagerNameOrObject: Maybe<string | PackageManager>): PackageManager {

  /** Get one of the preset package managers or throw an error if there is no match. */
  function getPresetPackageManager(packageManagerName: string): PackageManager {
    if (!(packageManagerName in packageManagers)) {
      throw new Error(`Invalid package manager: ${packageManagerName}`)
    }
    const key = packageManagerName as keyof typeof packageManagers
    return (packageManagers as any)[key]
  }

  return !packageManagerNameOrObject ? packageManagers.npm : // default to npm
  // use present package manager if name is specified
    typeof packageManagerNameOrObject === 'string' ? getPresetPackageManager(packageManagerNameOrObject!)! :
    // use provided package manager object otherwise
    packageManagerNameOrObject!
}

export default getPackageManager
