/**
 * Loggin functions.
 */

import Table from 'cli-table'
import Chalk from 'chalk'
import { colorizeDiff, isGithubUrl, getGithubUrlTag, isNpmAlias, parseNpmAlias } from './version-util'
import getRepoUrl from './lib/getRepoUrl'
import { IgnoredUpgrade, Index, Options, Version, VersionSpec } from './types'

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
export function print(options: Options, message: any, loglevel: 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'silly' | null = null, method: 'log' | 'warn' | 'info' | 'error' = 'log') {
  // not in json mode
  // not silent
  // not at a loglevel under minimum specified
  if (!options.json && options.loglevel !== 'silent' && (loglevel == null || logLevels[options.loglevel as unknown as keyof typeof logLevels] >= logLevels[loglevel])) {
    console[method](message)
  }
}

/** Pretty print a JSON object. */
export function printJson(options: Options, object: any) {
  if (options.loglevel !== 'silent') {
    console.log(JSON.stringify(object, null, 2))
  }
}

/** Create a table with the appropriate columns and alignment to render dependency upgrades. */
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
 * Extract just the version number from a package.json dep
 *
 * @param dep Raw dependency, could be version / npm: string / Git url
 */
function getVersion(dep: string): string {
  return isGithubUrl(dep) ? getGithubUrlTag(dep)!
    : isNpmAlias(dep) ? parseNpmAlias(dep)![1]
    : dep
}

/**
 * @param args
 * @param args.from
 * @param args.to
 * @param args.ownersChangedDeps
 * @param args.format Array of strings from the --format CLI arg
 */
function toDependencyTable({ from: fromDeps, to: toDeps, ownersChangedDeps, format }: {
  from: Index<VersionSpec>,
  to: Index<VersionSpec>,
  ownersChangedDeps?: Index<boolean>,
  format?: string[],
}) {
  const table = createDependencyTable()
  const rows = Object.keys(toDeps).map(dep => {
    const from = fromDeps[dep] || ''
    const toRaw = toDeps[dep] || ''
    const to = getVersion(toRaw)
    const ownerChanged = ownersChangedDeps
      ? dep in ownersChangedDeps
        ? ownersChangedDeps[dep] ? '*owner changed*' : ''
        : '*unknown*'
      : ''
    const toColorized = colorizeDiff(getVersion(from), to)
    const repoUrl = format?.includes('repo')
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
export function printUpgrades(options: Options, { current, latest, upgraded, numUpgraded, total, ownersChangedDeps }: {
  current: Index<VersionSpec>,
  latest?: Index<Version>,
  upgraded: Index<VersionSpec>,
  numUpgraded: number,
  total: number,
  ownersChangedDeps?: Index<boolean>,
}) {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  print(options, '')

  // print everything is up-to-date
  const smiley = chalk.green.bold(':)')
  const target = typeof options.target === 'string' ? options.target : 'target'
  if (numUpgraded === 0 && total === 0) {
    if (Object.keys(current).length === 0) {
      print(options, 'No dependencies.')
    }
    else if (latest && Object.keys(latest).length === 0) {
      print(options, `No package versions were returned. This is likely a problem with your installed ${options.packageManager}, the npm registry, or your Internet connection. Make sure ${chalk.cyan('npx pacote packument ncu-test-v2')} is working before reporting an issue.`)
    }
    else if (options.global) {
      print(options, `All global packages are up-to-date ${smiley}`)
    }
    else {
      print(options, `All dependencies match the ${target} package versions ${smiley}`)
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

/** Print updates that were ignored due to incompatible peer dependencies. */
export function printIgnoredUpdates(options: Options, ignoredUpdates: Index<IgnoredUpgrade>) {
  print(options, `\nIgnored incompatible updates (peer dependencies):\n`)
  const table = createDependencyTable()
  const rows = Object.entries(ignoredUpdates).map(([pkgName, { from, to, reason }]) => {
    const strReason = 'reason: ' + Object.entries(reason)
      .map(([pkgReason, requirement]) => pkgReason + ' requires ' + requirement)
      .join(', ')
    return [pkgName, from, '→', colorizeDiff(from, to), strReason]
  })
  rows.forEach(row => table.push(row)) // eslint-disable-line fp/no-mutating-methods
  print(options, table.toString())
}
