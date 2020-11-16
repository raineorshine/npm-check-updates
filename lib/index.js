//
// Dependencies
//

'use strict'

const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const cint = require('cint')
const findUp = require('find-up')
const _ = require('lodash')
const getstdin = require('get-stdin')
const chalk = require('chalk')
const { rcFile } = require('rc-config-loader')
const jph = require('json-parse-helpfulerror')
const vm = require('./versionmanager')
const doctor = require('./doctor')
const packageManagers = require('./package-managers')
const { print, printJson, printUpgrades } = require('./logging')
const { doctorHelpText } = require('./constants')
const cliOptions = require('./cli-options')

// maps package managers to package file names
const packageFileNames = {
  npm: 'package.json',
  yarn: 'package.json',
}

// time to wait for stdin before printing a warning
const stdinWarningTime = 5000
const stdinWarningMessage = `Hmmmmm... this is taking a long time. Your console is telling me to wait for input \non stdin, but maybe that is not what you want.\nTry ${chalk.cyan('winpty ncu.cmd')}, or specify a package file explicitly with ${chalk.cyan('--packageFile package.json')}. \nSee https://github.com/raineorshine/npm-check-updates/issues/136#issuecomment-155721102`

//
// Helper functions
//

function programError(options, message) {
  if (options.cli) {
    print(options, message, null, 'error')
    process.exit(1)
  }
  else {
    throw new Error(message)
  }
}

/**
 * Gets the name of the package file based on --packageFile or --packageManager.
 */
function getPackageFileName(options) {
  return options.packageFile ? options.packageFile :
    packageFileNames[options.packageManager] || packageFileNames.npm
}

const readPackageFile = _.partialRight(promisify(fs.readFile), 'utf8')
const writePackageFile = promisify(fs.writeFile)

//
// Main functions
//

async function analyzeGlobalPackages(options) {

  print(options, 'Getting installed packages...', 'verbose')

  const globalPackages = await vm.getInstalledPackages(
    _.pick(options, ['cwd', 'filter', 'filterVersion', 'global', 'packageManager', 'prefix', 'reject', 'rejectVersion'])
  )

  print(options, 'globalPackages', 'silly')
  print(options, globalPackages, 'silly')
  print(options, '', 'silly')
  print(options, `Fetching ${options.target} versions...`, 'verbose')

  const [upgraded, latest] = await vm.upgradePackageDefinitions(globalPackages, options)
  print(options, latest, 'silly')

  const upgradedPackageNames = Object.keys(upgraded)
  printUpgrades(options, {
    current: globalPackages,
    upgraded,
    latest,
    // since an interactive upgrade of globals is not available, the numUpgraded is always all
    numUpgraded: upgradedPackageNames.length,
    total: upgradedPackageNames.length
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
}

async function analyzeProjectDependencies(options, pkgData, pkgFile) {

  let pkg

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

  print(options, `Fetching ${options.target} versions...`, 'verbose')

  if (options.enginesNode) {
    options.enginesNode = _.get(pkg, 'engines.node')
  }

  print(options, '\nOptions (partial):', 'verbose')
  print(options, {
    registry: options.registry ? options.registry : null,
    pre: options.pre,
    packageManager: options.packageManager,
    json: options.json,
    enginesNode: options.enginesNode
  }, 'verbose')

  const [upgraded, latest] = await vm.upgradePackageDefinitions(current, options)

  print(options, '\nFetched:', 'verbose')
  print(options, latest, 'verbose')

  print(options, '\nUpgraded:', 'verbose')
  print(options, upgraded, 'verbose')

  const { newPkgData, selectedNewDependencies } = await vm.upgradePackageData(pkgData, current, upgraded, latest, options)

  const output = options.jsonAll ? jph.parse(newPkgData) :
    options.jsonDeps ?
      _.pick(jph.parse(newPkgData), 'dependencies', 'devDependencies', 'optionalDependencies') :
      selectedNewDependencies

  // will be overwritten with the result of writePackageFile so that the return promise waits for the package file to be written
  let writePromise = Promise.resolve()

  // split the deps into satisfied and unsatisfied to display in two separate tables
  const deps = Object.keys(selectedNewDependencies)
  const satisfied = cint.toObject(deps, dep => ({
    [dep]: vm.isSatisfied(latest[dep], current[dep])
  }))

  const isSatisfied = _.propertyOf(satisfied)
  const filteredUpgraded = options.minimal ? cint.filterObject(selectedNewDependencies, dep => !isSatisfied(dep)) : selectedNewDependencies
  const numUpgraded = Object.keys(filteredUpgraded).length

  const ownersChangedDeps = options.format.includes('ownerChanged')
    ? await vm.getOwnerPerDependency(current, filteredUpgraded, options)
    : null

  // print
  if (options.json) {
    // use the selectedNewDependencies dependencies data to generate new package data
    // INVARIANT: we don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.upgradePackageData simply does a find-and-replace on that
    printJson(options, output)
  }
  else {
    printUpgrades(options, {
      current,
      upgraded: filteredUpgraded,
      latest,
      numUpgraded,
      total: Object.keys(upgraded).length,
      ownersChangedDeps
    })
  }

  if (numUpgraded > 0) {

    // if there is a package file, write the new package data
    // otherwise, suggest ncu -u
    if (pkgFile) {
      if (options.upgrade) {
        // do not await until end
        writePromise = writePackageFile(pkgFile, newPkgData)
          .then(() => {
            print(options, `\nRun ${chalk.cyan('npm install')} to install new versions.\n`)
          })
      }
      else {
        print(options, `\nRun ${chalk.cyan('ncu -u')} to upgrade ${getPackageFileName(options)}`)
      }
    }

    // if errorLevel is 2, exit with error code
    if (options.errorLevel === 2) {
      writePromise.then(() => {
        programError(options, '\nDependencies not up-to-date')
      })
    }
  }

  await writePromise

  return output
}

//
// Program
//

/** Initializes and consolidates program options. */
function initOptions(options) {

  const json = Object.keys(options)
    .filter(option => option.startsWith('json'))
    .some(_.propertyOf(options))

  // disallow combination of --target, --greatest, or --newest
  if (options.target && options.greatest) {
    programError(options, chalk.red('Cannot specify both --target and --greatest. --greatest is an alias for "--target greatest".'))
  }
  else if (options.target && options.newest) {
    programError(options, chalk.red('Cannot specify both --target and --newest. --newest is an alias for "--target newest".'))
  }
  else if (options.greatest && options.newest) {
    programError(options, chalk.red('Cannot specify both --greatest and --newest. --greatest is an alias for "--target greatest" and --newest is an alias for "--target newest".'))
  }
  // disallow non-matching filter and args
  else if (options.filter && options.args.length > 0 && options.filter !== options.args.join(' ')) {
    programError(options, chalk.red('Cannot specify a filter using both --filter and args. Did you forget to quote an argument?') + '\nSee: https://github.com/raineorshine/npm-check-updates/issues/759#issuecomment-723587297')
  }

  const target = options.newest ? 'newest'
    : options.greatest ? 'greatest'
    : options.target || options.semverLevel || 'latest'

  const autoPre = target === 'newest' || target === 'greatest'

  const format = [
    ...options.format,
    ...options.ownerChanged ? ['ownerChanged'] : []
  ]

  return {
    ...options,
    filter: options.args.join(' ') || options.filter,
    // add shortcut for any keys that start with 'json'
    json,
    // convert silent option to loglevel silent
    loglevel: options.silent ? 'silent' : options.loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to false, except when newest or greatest are set
    ...options.pre != null || autoPre
      ? { pre: options.pre != null ? !!options.pre : autoPre }
      : null,
    target,
    // imply upgrade in interactive mode when json is not specified as the output
    upgrade: options.interactive && options.upgrade === undefined ? !json : options.upgrade,
    format,
  }
}

/**
 * @typedef {Array} PkgInfo
 * @property 0 pkgFile
 * @property 1 pkgData
 */

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
async function findPackage(options) {

  let pkgData
  let pkgFile
  let stdinTimer

  print(options, 'Running in local mode...', 'verbose')
  print(options, 'Finding package file data...', 'verbose')

  const pkgFileName = getPackageFileName(options)

  // returns: string
  function getPackageDataFromFile(pkgFile, pkgFileName) {
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
    print(options, 'Waiting for package data on stdin...', 'verbose')

    // warn the user after a while if still waiting for stdin
    // this is a way to mitigate #136 where Windows unexpectedly waits for stdin
    stdinTimer = setTimeout(() => {
      console.log(stdinWarningMessage)
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

// exit with non-zero error code when there is an unhandled promise rejection
process.on('unhandledRejection', err => {
  throw err
})

/** main entry point */
async function run(options = {}) {

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

  const deprecatedOptions = cliOptions.filter(({ long, deprecated }) => deprecated && options[long])
  if (deprecatedOptions.length > 0) {
    deprecatedOptions.forEach(({ short, long, description }) => {
      const deprecationMessage = `--${long}: ${description}`
      print(options, chalk.yellow(deprecationMessage), 'warn')
    })
    print(options, '', 'warn')
  }

  if (options.rcConfigPath && !options.doctor) {
    print(options, `Using config file ${options.rcConfigPath}`)
  }

  print(options, 'Initializing...', 'verbose')

  if (options.packageManager === 'npm' && !options.prefix) {
    options.prefix = await packageManagers.npm.defaultPrefix(options)
  }

  if (options.packageManager === 'yarn' && !options.prefix) {
    options.prefix = await packageManagers.yarn.defaultPrefix(options)
  }

  let timeout
  let timeoutPromise = new Promise(resolve => resolve)
  if (options.timeout) {
    const timeoutMs = _.isString(options.timeout) ? Number.parseInt(options.timeout, 10) : options.timeout
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

  async function getAnalysis() {
    if (options.global) {
      const analysis = await analyzeGlobalPackages(options)
      clearTimeout(timeout)
      return analysis
    }
    else {
      const [pkgData, pkgFile] = await findPackage(options)
      const analysis = await analyzeProjectDependencies(options, pkgData, pkgFile)
      clearTimeout(timeout)
      return analysis
    }
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
    return Promise.race([timeoutPromise, getAnalysis()])
  }
}

/**
 * Loads the .ncurc config file.
 *
 * @param [cfg]
 * @param [cfg.configFileName=.ncurc]
 * @param [cfg.configFilePath]
 * @param [cfg.packageFile]
 * @returns
 */
function getNcurc({ configFileName, configFilePath, packageFile } = {}) {

  const result = rcFile('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath ||
      (packageFile ? path.dirname(packageFile) : undefined)
  })

  // flatten config object into command line arguments to be read by commander
  const args = result ?
    _.flatten(_.map(result.config, (value, name) =>
      value === true ? [`--${name}`] : [`--${name}`, value]
    )) : []

  return result ? { ...result, args } : null
}

module.exports = { run, getNcurc, ...vm }
