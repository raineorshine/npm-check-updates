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
const packageManagers = require('./package-managers')
const { print, printJson, toDependencyTable } = require('./logging')

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

function analyzeGlobalPackages(options) {

  print(options, 'Getting installed packages...', 'verbose')

  return vm.getInstalledPackages({
    cwd: options.cwd,
    filter: options.filter,
    global: options.global,
    packageManager: options.packageManager,
    prefix: options.prefix,
    reject: options.reject
  })
    .then(globalPackages => {
      print(options, 'globalPackages', 'silly')
      print(options, globalPackages, 'silly')
      print(options, '', 'silly')
      print(options, `Fetching ${vm.getVersionTarget(options)} versions...`, 'verbose')

      return vm.upgradePackageDefinitions(globalPackages, options)
        .then(([upgraded, latest]) => {
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
        })
    })
}

function analyzeProjectDependencies(options, pkgData, pkgFile) {

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

  print(options, `Fetching ${vm.getVersionTarget(options)} versions...`, 'verbose')

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

  return vm.upgradePackageDefinitions(current, options).then(async ([upgraded, latest]) => {

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
        total: Object.keys(upgraded).length
      })
    }

    if (numUpgraded > 0) {

      // if there is a package file, write the new package data
      // otherwise, suggest ncu -u
      if (pkgFile) {
        if (options.upgrade) {
          writePromise = writePackageFile(pkgFile, newPkgData)
            .then(() => {
              print(options, `\nRun ${chalk.cyan('npm install')} to install new versions.\n`)
            })
        }
        else {
          print(options, `\nRun ${chalk.cyan('ncu -u')} to upgrade ${getPackageFileName(options)}`)
        }
      }

      // if error-level is 2, exit with error code
      if (options.errorLevel === 2) {
        writePromise.then(() => {
          programError(options, '\nDependencies not up-to-date')
        })
      }
    }

    return writePromise.then(() => output)
  })
}

/**
 * @param options - Options from the configuration
 * @param args - The arguments passed to the function.
 * @param args.current - The current packages.
 * @param args.upgraded - The packages that should be upgraded.
 * @param args.numUpgraded - The number of upgraded packages
 * @param args.total - The total number of all possible upgrades
 */
function printUpgrades(options, { current, upgraded, numUpgraded, total }) {
  print(options, '')

  // print everything is up-to-date
  const smiley = chalk.green.bold(':)')
  if (numUpgraded === 0 && total === 0) {
    if (Object.keys(current).length === 0) {
      print(options, 'No dependencies.')
    }
    else if (options.global) {
      print(options, `All global packages are up-to-date ${smiley}`)
    }
    else {
      print(options, `All dependencies match the ${vm.getVersionTarget(options)} package versions ${smiley}`)
    }
  }
  else if (numUpgraded === 0 && total > 0) {
    print(options, `All dependencies match the desired package versions ${smiley}`)
  }

  // print table
  if (numUpgraded > 0) {
    const table = toDependencyTable({
      from: current,
      to: upgraded
    })
    print(options, table.toString())
  }
}

//
// Program
//

/** Initializes and consolidates options from the cli. */
function initOptions(options) {
  const json = Object.keys(options)
    .filter(option => option.startsWith('json'))
    .some(_.propertyOf(options))

  return {
    ...options,
    filter: options.args.join(' ') || options.filter,
    // convert silent option to loglevel silent
    loglevel: options.silent ? 'silent' : options.loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to 0, except when newest or greatest are set
    pre: options.pre != null ? Boolean(Number(options.pre)) : options.newest || options.greatest,
    // add shortcut for any keys that start with 'json'
    json,
    // imply upgrade in interactive mode when json is not specified as the output
    upgrade: options.interactive && options.upgrade === undefined ? !json : options.upgrade
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
      // print a message if we are using a descendant package file
      const relPathToPackage = path.resolve(pkgFile)
      if (relPathToPackage !== pkgFileName) {
        print(options, `${options.upgrade ? 'Upgrading' : 'Checking'} ${relPathToPackage}`)
      }
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
    const defaultOptions = {
      jsonUpgraded: true,
      loglevel: 'silent',
      packageManager: 'npm',
      args: []
    }
    options = { ...defaultOptions, ...options }
  }

  options = initOptions(options)

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

  return Promise.race([timeoutPromise, getAnalysis()])
}

/**
 * @param [cfg]
 * @param [cfg.configFileName=.ncurc]
 * @param [cfg.configFilePath]
 * @param [cfg.packageFile]
 * @returns
 */
function getNcurc({ configFileName, configFilePath, packageFile } = {}) {
  const file = rcFile('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath ||
            (packageFile ? path.dirname(packageFile) : undefined)
  })
  return file && file.config
}

module.exports = { run, getNcurc, ...vm }
