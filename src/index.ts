import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import globby from 'globby'
import * as cint from 'cint'
import _ from 'lodash'
import Chalk from 'chalk'
import jph from 'json-parse-helpfulerror'
import * as vm from './versionmanager'
import doctor from './doctor.js'
import packageManagers from './package-managers'
import * as logging from './logging'
import * as constants from './constants'
import cliOptions from './cli-options.js'
import getNcuRc from './lib/getNcuRc'
import getPeerDependencies from './lib/getPeerDependencies'
import getIgnoredUpgrades from './lib/getIgnoredUpgrades'
import programError from './lib/programError'
import upgradePackageDefinitions from './lib/upgradePackageDefinitions'
import getPackageFileName from './lib/getPackageFileName'
import findPackage from './lib/findPackage'
import initOptions from './lib/initOptions'
import { Index, Maybe, Options, PackageFile, VersionDeclaration } from './types'

const { doctorHelpText } = constants
const { print, printJson, printUpgrades, printIgnoredUpdates } = logging

//
// Global Error Handling
//

/**
 * @typedef {Array} PkgInfo
 * @property 0 pkgFile
 * @property 1 pkgData
 */

// exit with non-zero error code when there is an unhandled promise rejection
process.on('unhandledRejection', err => {
  throw err
})

//
// Helper functions
//

const writePackageFile = promisify(fs.writeFile)

/** Recreate the options object sorted. */
function sortOptions(options: Options): Options {
  // eslint-disable-next-line fp/no-mutating-methods
  return _.transform(Object.keys(options).sort(), (accum, key) => {
    accum[key] = options[key as keyof Options]
  }, {} as any)
}

//
// Main functions
//

/** Checks global dependencies for upgrades. */
async function runGlobal(options: Options): Promise<void> {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  print(options, 'Getting installed packages', 'verbose')

  const globalPackages = await vm.getInstalledPackages(
    _.pick(options, ['cwd', 'filter', 'filterVersion', 'global', 'packageManager', 'prefix', 'reject', 'rejectVersion'])
  )

  print(options, 'globalPackages', 'silly')
  print(options, globalPackages, 'silly')
  print(options, '', 'silly')
  print(options, `Fetching ${options.target} versions`, 'verbose')

  const [upgraded, latest] = await upgradePackageDefinitions(globalPackages, options)
  print(options, latest, 'silly')

  const upgradedPackageNames = Object.keys(upgraded)
  printUpgrades(options, {
    current: globalPackages,
    upgraded,
    // since an interactive upgrade of globals is not available, the numUpgraded is always all
    numUpgraded: upgradedPackageNames.length,
    total: upgradedPackageNames.length,
  })

  const instruction = upgraded
    ? upgradedPackageNames.map(pkg => pkg + '@' + upgraded[pkg]).join(' ')
    : '[package]'

  if (options.json) {
    // since global packages do not have a package.json, return the upgraded deps directly (no version range replacements)
    printJson(options, upgraded)
  }
  else if (instruction.length) {
    const upgradeCmd = options.packageManager === 'yarn' ? 'yarn global upgrade' : 'npm -g install'

    print(options, '\n' + chalk.cyan('ncu') + ' itself cannot upgrade global packages. Run the following to upgrade all global packages: \n\n' + chalk.cyan(`${upgradeCmd} ` + instruction) + '\n')
  }

  // if errorLevel is 2, exit with non-zero error code
  if (options.cli && options.errorLevel === 2 && upgradedPackageNames.length > 0) {
    process.exit(1)
  }
}

/** Checks local project dependencies for upgrades. */
async function runLocal(options: Options, pkgData?: Maybe<string>, pkgFile?: Maybe<string>): Promise<PackageFile | Index<VersionDeclaration>> {

  let pkg

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  try {
    if (!pkgData) {
      throw new Error('pkgData: ' + pkgData)
    }
    else {
      pkg = jph.parse(pkgData)
    }
  }
  catch (e) {
    programError(options, chalk.red(`Invalid package file${pkgFile ? `: ${pkgFile}` : ' from stdin'}. Error details:\n${e.message}`))
  }

  const current = vm.getCurrentDependencies(pkg, options)

  print(options, `Fetching ${options.target} versions`, 'verbose')

  if (options.enginesNode) {
    options.nodeEngineVersion = _.get(pkg, 'engines.node')
  }

  print(options, '\nOptions:', 'verbose')
  print(options, sortOptions(options), 'verbose')

  if (options.peer) {
    options.peerDependencies = getPeerDependencies(current, options)
  }

  const [upgraded, latest, upgradedPeerDependencies] = await upgradePackageDefinitions(current, options)

  if (options.peer) {
    print(options, '\nupgradedPeerDependencies:', 'verbose')
    print(options, upgradedPeerDependencies, 'verbose')
  }

  print(options, '\nFetched:', 'verbose')
  print(options, latest, 'verbose')

  print(options, '\nUpgraded:', 'verbose')
  print(options, upgraded, 'verbose')

  const { newPkgData, selectedNewDependencies } = await vm.upgradePackageData(pkgData!, current, upgraded, latest, options)

  const output = options.jsonAll ? jph.parse(newPkgData) as PackageFile :
    options.jsonDeps ?
      _.pick(jph.parse(newPkgData) as PackageFile, 'dependencies', 'devDependencies', 'optionalDependencies') :
      selectedNewDependencies

  // will be overwritten with the result of writePackageFile so that the return promise waits for the package file to be written
  let writePromise = Promise.resolve()

  // split the deps into satisfied and unsatisfied to display in two separate tables
  const deps = Object.keys(selectedNewDependencies)
  const satisfied = cint.toObject(deps, (dep: string) => ({
    [dep]: vm.isSatisfied(latest[dep], current[dep])
  }))

  const isSatisfied = _.propertyOf(satisfied)
  const filteredUpgraded = options.minimal ? cint.filterObject(selectedNewDependencies, (dep: string) => !isSatisfied(dep)) : selectedNewDependencies
  const numUpgraded = Object.keys(filteredUpgraded).length

  const ownersChangedDeps = (options.format || []).includes('ownerChanged')
    ? await vm.getOwnerPerDependency(current, filteredUpgraded, options)
    : undefined

  // print
  if (options.json && !options.deep) {
    // use the selectedNewDependencies dependencies data to generate new package data
    // INVARIANT: we don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.upgradePackageData simply does a find-and-replace on that
    printJson(options, output)
  }
  else {
    printUpgrades(options, {
      current,
      upgraded: filteredUpgraded,
      numUpgraded,
      total: Object.keys(upgraded).length,
      ownersChangedDeps
    })
    if (options.peer) {
      const ignoredUpdates = await getIgnoredUpgrades(current, upgraded, upgradedPeerDependencies!, options)
      if (!_.isEmpty(ignoredUpdates)) {
        printIgnoredUpdates(options, ignoredUpdates)
      }
    }
  }

  if (numUpgraded > 0) {

    // if there is a package file, write the new package data
    // otherwise, suggest ncu -u
    if (pkgFile) {
      if (options.upgrade) {
        // do not await until end
        writePromise = writePackageFile(pkgFile, newPkgData)
          .then(() => {
            print(options, `\nRun ${chalk.cyan(options.packageManager === 'yarn' ? 'yarn install' : 'npm install')} to install new versions.\n`)
          })
      }
      else {
        print(options, `\nRun ${chalk.cyan('ncu -u')} to upgrade ${getPackageFileName(options)}`)
      }
    }

    // if errorLevel is 2, exit with non-zero error code
    if (options.errorLevel === 2) {
      writePromise.then(() => {
        programError(options, '\nDependencies not up-to-date')
      })
    }
  }

  await writePromise

  return output
}

/** Main entry point.
 *
 * @returns Promise<
 * PackageFile                    Default returns upgraded package file.
 * | Index<VersionDeclaration>    --jsonUpgraded returns only upgraded dependencies.
 * | void                         --global upgrade returns void.
 * >
 */
export async function run(options: Options = {}): Promise<PackageFile | Index<VersionDeclaration> | void> {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  // if not executed on the command-line (i.e. executed as a node module), set some defaults
  if (!options.cli) {
    const cliDefaults = cliOptions.reduce((acc, curr) => ({
      ...acc,
      ...curr.default != null ? { [curr.long]: curr.default } : null,
    }), {})
    const defaultOptions = {
      ...cliDefaults,
      jsonUpgraded: true,
      silent: options.silent || options.loglevel === undefined,
      args: []
    }
    options = { ...defaultOptions, ...options }
  }

  options = initOptions(options)

  const deprecatedOptions = cliOptions.filter(({ long, deprecated }) => deprecated && options[long as keyof Options])
  if (deprecatedOptions.length > 0) {
    deprecatedOptions.forEach(({ long, description }) => {
      const deprecationMessage = `--${long}: ${description}`
      print(options, chalk.yellow(deprecationMessage), 'warn')
    })
    print(options, '', 'warn')
  }

  if (options.rcConfigPath && !options.doctor) {
    print(options, `Using config file ${options.rcConfigPath}`)
  }

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
        const pkgOptions = {
          ...options,
          ...rcResult && rcResult.config,
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

export { default as getNcuRc } from './lib/getNcuRc'
export * from './versionmanager'
export default run
