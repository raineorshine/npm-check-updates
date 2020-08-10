/**
 * Loggin functions.
 */

const Table = require('cli-table')
const { colorizeDiff } = require('./version-util')

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
    colAligns: ['left', 'right', 'right', 'right'],
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
 * @returns
 */
function toDependencyTable(args) {
  const table = createDependencyTable()
  const rows = Object.keys(args.to).map(dep => {
    const from = args.from[dep] || ''
    const to = colorizeDiff(args.from[dep], args.to[dep] || '')
    return [dep, from, '→', to]
  })
  rows.forEach(row => table.push(row)) // eslint-disable-line fp/no-mutating-methods
  return table
}

module.exports = { print, printJson, toDependencyTable }
