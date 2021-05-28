import _ from 'lodash'
import path from 'path'
import fs from 'fs'
import { promisify } from 'util'
import Chalk from 'chalk'
import findUp from 'find-up'
import getstdin from 'get-stdin'
import getPackageFileName from './getPackageFileName'
import programError from './programError'
import { print } from '../logging'
import { Options } from '../types'

// time to wait for stdin before printing a warning
const stdinWarningTime = 5000

const readPackageFile = _.partialRight(promisify(fs.readFile), 'utf8') as any

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
  let stdinTimer

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  print(options, 'Running in local mode', 'verbose')
  print(options, 'Finding package file data', 'verbose')

  const pkgFileName = getPackageFileName(options)

  /** Reads the contents of a package file. */
  function getPackageDataFromFile(pkgFile: string | null | undefined, pkgFileName: string): string {
    // exit if no pkgFile to read from fs
    if (pkgFile != null) {
      const relPathToPackage = path.resolve(pkgFile)
      print(options, `${options.upgrade ? 'Upgrading' : 'Checking'} ${relPathToPackage}`)
    }
    else {
      programError(options, `${chalk.red(`No ${pkgFileName}`)}\n\nPlease add a ${pkgFileName} to the current directory, specify the ${chalk.cyan('--packageFile')} or ${chalk.cyan('--packageData')} options, or pipe a ${pkgFileName} to stdin.`)
    }

    return readPackageFile(pkgFile)
  }

  // get the package data from the various input possibilities
  if (options.packageData) {
    pkgFile = null
    pkgData = Promise.resolve(options.packageData)
  }
  else if (options.packageFile) {
    pkgFile = options.packageFile
    pkgData = getPackageDataFromFile(pkgFile, pkgFileName)
  }
  else if (!process.stdin.isTTY) {
    print(options, 'Waiting for package data on stdin', 'verbose')

    // warn the user after a while if still waiting for stdin
    // this is a way to mitigate #136 where Windows unexpectedly waits for stdin
    stdinTimer = setTimeout(() => {
      console.log(`Hmmmmm... this is taking a long time. Your console is telling me to wait for input \non stdin, but maybe that is not what you want.\nTry ${chalk.cyan('winpty ncu.cmd')}, or specify a package file explicitly with ${chalk.cyan('--packageFile package.json')}. \nSee https://github.com/raineorshine/npm-check-updates/issues/136#issuecomment-155721102`)
    }, stdinWarningTime)

    // get data from stdin
    // trim stdin to account for \r\n
    // clear the warning timer once stdin returns
    const stdinData = await getstdin()
    const data = stdinData.trim().length > 0 ? stdinData : null
    clearTimeout(stdinTimer)

    // if no stdin content fall back to searching for package.json from pwd and up to root
    pkgFile = data || !pkgFileName ? null : findUp.sync(pkgFileName)
    pkgData = data || getPackageDataFromFile(await pkgFile, pkgFileName)
  }
  else {
    // find the closest package starting from the current working directory and going up to the root
    pkgFile = pkgFileName ? findUp.sync(pkgFileName) : null
    pkgData = getPackageDataFromFile(pkgFile, pkgFileName)
  }

  return Promise.all([pkgData, pkgFile])
}

export default findPackage
