import { Options } from '../types'

// maps package managers to package file names
const packageFileNames = {
  npm: 'package.json',
  yarn: 'package.json',
}

/**
 * Gets the name of the package file based on --packageFile or --packageManager.
 */
function getPackageFileName(options: Options) {
  return options.packageFile ? options.packageFile :
    packageFileNames[options.packageManager as 'npm' | 'yarn'] || packageFileNames.npm
}

export default getPackageFileName
