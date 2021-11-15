import os from 'os'
import path from 'path'
import globby from 'globby'
import _ from 'lodash'
import Chalk from 'chalk'
import packageManagers from './package-managers'
import { doctorHelpText } from './constants'
import { print, printJson } from './logging'
import findPackage from './lib/findPackage'
import doctor from './lib/doctor'
import getNcuRc from './lib/getNcuRc'
import getPackageFileName from './lib/getPackageFileName'
import mergeOptions from './lib/mergeOptions'
import initOptions from './lib/initOptions'
import programError from './lib/programError'
import runGlobal from './lib/runGlobal'
import runLocal from './lib/runLocal'
import { Index, PackageFile, RunOptions, VersionSpec } from './types'

// exit with non-zero error code when there is an unhandled promise rejection
process.on('unhandledRejection', err => {
  throw err
})

/** Main entry point.
 *
 * @returns Promise<
 * PackageFile                    Default returns upgraded package file.
 * | Index<VersionSpec>    --jsonUpgraded returns only upgraded dependencies.
 * | void                         --global upgrade returns void.
 * >
 */
export async function run(runOptions: RunOptions = {}, { cli }: { cli?: boolean } = {}): Promise<PackageFile | Index<VersionSpec> | void> {

  const chalk = runOptions.color ? new Chalk.Instance({ level: 1 }) : Chalk

  const options = initOptions(runOptions, { cli })

  print(options, 'Initializing', 'verbose')

  if (options.packageManager === 'npm' && !options.prefix) {
    options.prefix = await packageManagers.npm.defaultPrefix!(options)
  }

  if (options.packageManager === 'yarn' && !options.prefix) {
    options.prefix = await packageManagers.yarn.defaultPrefix!(options)
  }

  let timeout: NodeJS.Timeout
  let timeoutPromise: Promise<void> = new Promise(() => null)
  if (options.timeout) {
    const timeoutMs = _.isString(options.timeout)
      ? Number.parseInt(options.timeout, 10)
      : options.timeout
    timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        // must catch the error and reject explicitly since we are in a setTimeout
        const error = `Exceeded global timeout of ${timeoutMs}ms`
        reject(error)
        try {
          programError(options, chalk.red(error))
        }
        catch (e) { /* noop */ }
      }, timeoutMs)
    })
  }

  /** Runs the dependency upgrades. Loads the ncurc, finds the package file, and handles --deep. */
  async function runUpgrades(): Promise<Index<string> | PackageFile | void> {
    const defaultPackageFilename = getPackageFileName(options)
    const pkgs = globby.sync(options.cwd
      ? path.resolve(options.cwd.replace(/^~/, os.homedir()), defaultPackageFilename)
        .replace(/\\/g, '/') // convert Windows path to *nix path for globby
      : defaultPackageFilename, {
      ignore: ['**/node_modules/**']
    })
    options.deep = options.deep || pkgs.length > 1

    let analysis: Index<string> | PackageFile | void
    if (options.global) {
      const analysis = await runGlobal(options)
      clearTimeout(timeout)
      return analysis
    }
    else if (options.deep) {
      analysis = await pkgs.reduce(async (previousPromise, packageFile) => {
        const packages = await previousPromise
        // copy object to prevent share .ncurc options between different packageFile, to prevent unpredictable behavior
        const rcResult = getNcuRc({ packageFile })
        let rcConfig = rcResult && rcResult.config ? rcResult.config : {}
        if (options.mergeConfig && Object.keys(rcConfig).length) {
          // Merge config options.
          rcConfig = mergeOptions(options, rcConfig)
        }
        const pkgOptions = {
          ...options,
          ...rcConfig,
          packageFile,
        }
        const [pkgData, pkgFile] = await findPackage(pkgOptions)
        return {
          ...packages,
          // index by relative path if cwd was specified
          [pkgOptions.cwd
            ? path.relative(path.resolve(pkgOptions.cwd), pkgFile!)
              // convert Windows path to *nix path for consistency
              .replace(/\\/g, '/')
            : pkgFile!
          ]: await runLocal(pkgOptions, pkgData, pkgFile)
        }
      }, Promise.resolve({} as Index<string> | PackageFile))
      if (options.json) {
        printJson(options, analysis)
      }
    }
    else {
      // Mutate packageFile when glob patern finds only single package
      if (pkgs.length === 1 && pkgs[0] !== defaultPackageFilename) {
        options.packageFile = pkgs[0]
      }
      const [pkgData, pkgFile] = await findPackage(options)
      analysis = await runLocal(options, pkgData, pkgFile)
    }
    clearTimeout(timeout)
    return analysis
  }

  // doctor mode
  if (options.doctor) {

    // execute with -u
    if (options.upgrade) {
      // we have to pass run directly since it would be a circular require if doctor included this file
      return Promise.race([timeoutPromise, doctor(run, options)])
    }
    // print help otherwise
    else {
      print(options, doctorHelpText, 'warn')
    }
  }
  // normal mode
  else {
    return Promise.race([timeoutPromise, runUpgrades()])
  }
}

export default run
