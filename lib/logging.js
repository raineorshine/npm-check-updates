/**
 * Loggin functions.
 */

const Table = require('cli-table')
const chalk = require('chalk')
const { colorizeDiff, isGithubUrl, getGithubUrlTag, isNpmAlias, parseNpmAlias } = require('./version-util')
const { getRepoUrl } = require('./repo-url')

// maps string levels to numeric levels
const logLevels = {
  silent: 0,
  error: 1,
  minimal: 2,
  warn: 3,
  info: 4,
  verbose: 5,
  silly: 6
}

/**
 * Prints a message if it is included within options.loglevel.
 *
 * @param options    Command line options. These will be compared to the loglevel parameter to determine if the message gets printed.
 * @param message    The message to print
 * @param loglevel   silent|error|warn|info|verbose|silly
 * @param method     The console method to call. Default: 'log'.
 */
function print(options, message, loglevel, method = 'log') {
  // not in json mode
  // not silent
  // not at a loglevel under minimum specified
  if (!options.json && options.loglevel !== 'silent' && (loglevel == null || logLevels[options.loglevel] >= logLevels[loglevel])) {
    console[method](message)
  }
}

function printJson(options, object) {
  if (options.loglevel !== 'silent') {
    console.log(JSON.stringify(object, null, 2))
  }
}

function createDependencyTable() {
  return new Table({
    colAligns: ['left', 'right', 'right', 'right', 'left', 'left'],
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
      middle: ''
    }
  })
}

/**
 * @param args
 * @param args.from
 * @param args.to
 * @param args.ownersChangedDeps
 * @param args.format Array of strings from the --format CLI arg
 */
function toDependencyTable({ from: fromDeps, to: toDeps, ownersChangedDeps, format }) {
  const table = createDependencyTable()
  const rows = Object.keys(toDeps).map(dep => {
    const from = fromDeps[dep] || ''
    const toRaw = toDeps[dep] || ''
    const to = isGithubUrl(toRaw) ? getGithubUrlTag(toRaw)
      : isNpmAlias(toRaw) ? parseNpmAlias(toRaw)[1]
      : toRaw
    const ownerChanged = ownersChangedDeps
      ? dep in ownersChangedDeps
        ? ownersChangedDeps[dep] ? '*owner changed*' : ''
        : '*unknown*'
      : ''
    const toColorized = colorizeDiff(from, to)
    const repoUrl = format.includes('repo')
      ? getRepoUrl(dep) || ''
      : ''
    return [dep, from, '→', toColorized, ownerChanged, repoUrl]
  })
  rows.forEach(row => table.push(row)) // eslint-disable-line fp/no-mutating-methods
  return table
}

/**
 * @param options - Options from the configuration
 * @param args - The arguments passed to the function.
 * @param args.current - The current packages.
 * @param args.upgraded - The packages that should be upgraded.
 * @param args.numUpgraded - The number of upgraded packages
 * @param args.total - The total number of all possible upgrades
 * @param args.ownersChangedDeps - Boolean flag per dependency which announces if package owner changed.
 */
function printUpgrades(options, { current, upgraded, numUpgraded, total, ownersChangedDeps }) {
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
      print(options, `All dependencies match the ${options.target} package versions ${smiley}`)
    }
  }
  else if (numUpgraded === 0 && total > 0) {
    print(options, `All dependencies match the desired package versions ${smiley}`)
  }

  // print table
  if (numUpgraded > 0) {
    const table = toDependencyTable({
      from: current,
      to: upgraded,
      ownersChangedDeps,
      format: options.format,
    })
    print(options, table.toString())
  }
}

module.exports = { print, printJson, printUpgrades, toDependencyTable }
