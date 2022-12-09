import findUp from 'find-up'
import fs from 'fs/promises'
import getstdin from 'get-stdin'
import path from 'path'
import { print } from '../lib/logging'
import { Options } from '../types/Options'
import chalk from './chalk'
import programError from './programError'

/**
 * Finds the package file and data.
 *
 * Searches as follows:
 * --packageData flag
 * --packageFile flag
 * --stdin
 * --findUp
 *
 * @returns Promise<PkgInfo>
 */
async function findPackage(options: Options) {
  let pkgData
  let pkgFile = null
  const pkgPath = options.packageFile || 'package.json'

  /** Reads the contents of a package file. */
  function getPackageDataFromFile(pkgFile: string | null | undefined, pkgFileName: string): Promise<string> {
    // exit if no pkgFile to read from fs
    if (pkgFile != null) {
      const relPathToPackage = path.resolve(pkgFile)
      print(options, `${options.upgrade ? 'Upgrading' : 'Checking'} ${relPathToPackage}`)
    } else {
      programError(
        options,
        `${chalk.red(
          `No ${pkgFileName}`,
        )}\n\nPlease add a ${pkgFileName} to the current directory, specify the ${chalk.cyan(
          '--packageFile',
        )} or ${chalk.cyan('--packageData')} options, or pipe a ${pkgFileName} to stdin.`,
      )
    }

    return fs.readFile(pkgFile!, 'utf-8')
  }

  print(options, 'Running in local mode', 'verbose')
  print(options, 'Finding package file data', 'verbose')

  // get the package data from the various input possibilities
  if (options.packageData) {
    pkgFile = null
    pkgData = Promise.resolve(options.packageData)
  } else if (options.packageFile) {
    pkgFile = options.packageFile
    pkgData = getPackageDataFromFile(pkgFile, pkgPath)
  } else if (options.stdin) {
    print(options, 'Waiting for package data on stdin', 'verbose')

    // get data from stdin
    // trim stdin to account for \r\n
    const stdinData = await getstdin()
    const data = stdinData.trim().length > 0 ? stdinData : null

    // if no stdin content fall back to searching for package.json from pwd and up to root
    pkgFile = data || !pkgPath ? null : findUp.sync(pkgPath)
    pkgData = data || getPackageDataFromFile(await pkgFile, pkgPath)
  } else {
    // find the closest package starting from the current working directory and going up to the root
    pkgFile = pkgPath ? findUp.sync(pkgPath, { cwd: options.cwd || process.cwd() }) : null
    pkgData = getPackageDataFromFile(pkgFile, pkgPath)
  }

  return Promise.all([pkgData, pkgFile])
}

export default findPackage
