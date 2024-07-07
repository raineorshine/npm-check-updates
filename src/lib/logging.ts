/**
 * Loggin functions.
 */
import Table from 'cli-table3'
import { IgnoredUpgradeDueToEnginesNode } from '../types/IgnoredUpgradeDueToEnginesNode'
import { IgnoredUpgradeDueToPeerDeps } from '../types/IgnoredUpgradeDueToPeerDeps'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'
import chalk from './chalk'
import filterObject from './filterObject'
import getRepoUrl from './getRepoUrl'
import {
  colorizeDiff,
  getDependencyGroups,
  getGithubUrlTag,
  isGithubUrl,
  isNpmAlias,
  parseNpmAlias,
} from './version-util'

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'silly' | null

// maps string levels to numeric levels
const logLevels = {
  silent: 0,
  error: 1,
  minimal: 2,
  warn: 3,
  info: 4,
  verbose: 5,
  silly: 6,
}

/** Returns true if the dependency spec is not fetchable from the registry and is ignored. */
const isFetchable = (spec: VersionSpec) =>
  !spec.startsWith('file:') &&
  !spec.startsWith('link:') &&
  !spec.startsWith('workspace:') &&
  // short github urls that are ignored, e.g. raineorshine/foo
  !/^[^/:@]+\/\w+/.test(spec)

/**
 * Prints a message if it is included within options.loglevel.
 *
 * @param options    Command line options. These will be compared to the loglevel parameter to determine if the message gets printed.
 * @param message    The message to print
 * @param loglevel   silent|error|warn|info|verbose|silly
 * @param method     The console method to call. Default: 'log'.
 */
export function print(
  options: Options,
  message: any,
  loglevel: LogLevel = null,
  method: 'log' | 'warn' | 'info' | 'error' = 'log',
) {
  // not in json mode
  // not silent
  // not at a loglevel under minimum specified
  if (
    !options.json &&
    options.loglevel !== 'silent' &&
    (loglevel == null ||
      logLevels[(options.loglevel ?? 'warn') as unknown as keyof typeof logLevels] >= logLevels[loglevel])
  ) {
    console[method](message)
  }
}

/** Pretty print a JSON object. */
export function printJson(options: Options, object: any) {
  if (options.loglevel !== 'silent') {
    console.log(JSON.stringify(object, null, 2))
  }
}

/** Print JSON object keys as string joined by character. */
export function printSimpleJoinedString(object: any, join: string) {
  console.log(
    Object.keys(object)
      .map(pkg => pkg + '@' + object[pkg])
      .join(join),
  )
}

/** Prints an object sorted by key. */
export function printSorted<T extends { [key: string]: any }>(options: Options, obj: T, loglevel: LogLevel) {
  const sortedKeys = Object.keys(obj).sort() as (keyof T)[]
  const objSorted = sortedKeys.reduce<T>((accum, key) => {
    accum[key] = obj[key]
    return accum
  }, {} as T)
  print(options, objSorted, loglevel)
}

/** Create a table with the appropriate columns and alignment to render dependency upgrades. */
function renderDependencyTable(rows: string[][]) {
  const table = new Table({
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
      middle: '',
    },
  })

  table.push(...rows)

  // when border is removed, whitespace remains
  // trim the end of each line to remove whitespace
  // this makes no difference visually, but the whitespace interacts poorly with .editorconfig in tests
  return table
    .toString()
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
}

/**
 * Extract just the version number from a package.json dep
 *
 * @param dep Raw dependency, could be version / npm: string / Git url
 */
function getVersion(dep: string): string {
  return isGithubUrl(dep) ? getGithubUrlTag(dep)! : isNpmAlias(dep) ? parseNpmAlias(dep)![1] : dep
}

/**
 * Renders a color-coded table of upgrades.
 *
 * @param args
 * @param args.from
 * @param args.to
 * @param args.ownersChangedDeps
 * @param args.format
 */
export async function toDependencyTable({
  from: fromDeps,
  to: toDeps,
  format,
  ownersChangedDeps,
  pkgFile,
  time,
}: {
  from: Index<VersionSpec>
  to: Index<VersionSpec>
  format?: string[]
  ownersChangedDeps?: Index<boolean>
  /** See: logging/getPackageRepo pkgFile param. */
  pkgFile?: string
  time?: Index<string>
}) {
  const table = renderDependencyTable(
    await Promise.all(
      Object.keys(toDeps)
        .sort()
        .map(async dep => {
          const from = fromDeps[dep] || ''
          const toRaw = toDeps[dep] || ''
          const to = getVersion(toRaw)
          const ownerChanged = ownersChangedDeps
            ? dep in ownersChangedDeps
              ? ownersChangedDeps[dep]
                ? '*owner changed*'
                : ''
              : '*unknown*'
            : ''
          const toColorized = colorizeDiff(getVersion(from), to)
          const repoUrl = format?.includes('repo') ? (await getRepoUrl(dep, undefined, { pkgFile })) || '' : ''
          const publishTime = format?.includes('time') && time?.[dep] ? time[dep] : ''
          return [dep, from, '→', toColorized, ownerChanged, ...[repoUrl, publishTime].filter(x => x)]
        }),
    ),
  )
  return table
}

/**
 * Renders one or more color-coded tables with all upgrades. Supports different formats from the --format option.
 *
 * @param args
 * @param args.current
 * @param args.upgraded
 * @param args.ownersChangedDeps
 * @param options
 */
export async function printUpgradesTable(
  {
    current,
    upgraded,
    ownersChangedDeps,
    pkgFile,
    time,
  }: {
    current: Index<VersionSpec>
    upgraded: Index<VersionSpec>
    ownersChangedDeps?: Index<boolean>
    pkgFile?: string
    time?: Index<string>
  },
  options: Options,
) {
  // group
  if (options.format?.includes('group')) {
    const groups = getDependencyGroups(upgraded, current, options)

    for (const { heading, packages } of groups) {
      print(options, '\n' + heading)
      print(
        options,
        await toDependencyTable({
          from: current,
          to: packages,
          format: options.format,
          ownersChangedDeps,
          pkgFile,
          time,
        }),
      )
    }
  } else {
    if (options.format?.includes('lines')) {
      printSimpleJoinedString(upgraded, '\n')
    } else {
      print(
        options,
        await toDependencyTable({
          from: current,
          to: upgraded,
          format: options.format,
          ownersChangedDeps,
          pkgFile,
          time,
        }),
      )
    }
  }
}

/** Prints errors. */
function printErrors(options: Options, errors?: Index<string>) {
  if (!errors) return
  if (Object.keys(errors).length > 0) {
    const errorTable = new Table({
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
        middle: '',
      },
    })

    errorTable.push(...Object.entries(errors).map(([dep, error]) => [dep, chalk.yellow(error)]))

    print(options, '\n' + errorTable.toString())
  }
}

/**
 * @param args.current -
 * @param args.latest -
 * @param args.upgraded -
 * @param args.total -
 * @param args.ownersChangedDeps -
 */
export async function printUpgrades(
  options: Options,
  {
    current,
    latest,
    upgraded,
    total,
    ownersChangedDeps,
    pkgFile,
    time,
    errors,
  }: {
    // Current package versions
    current: Index<VersionSpec>
    // Latest package versions according to the target. This is only used to detect an empty result from npm.
    latest?: Index<VersionResult>
    // Upgraded package specifications
    upgraded: Index<VersionSpec>
    // The total number of all possible upgrades. This is used to differentiate "no dependencies" from "no upgrades"
    total: number
    // Boolean flag per dependency which announces if package owner changed. Only used by --format ownerChanged
    ownersChangedDeps?: Index<boolean>
    // See: logging/getPackageRepo pkgFile param
    pkgFile?: string
    // Time published if options.format includes "time"
    time?: Index<string>
    // Any errors that were encountered when fetching versions.
    errors?: Index<string>
  },
) {
  if (!options.format?.includes('group')) {
    print(options, '')
  }

  const smiley = chalk.green.bold(':)')
  const numErrors = Object.keys(errors || {}).length
  const target = typeof options.target === 'string' ? options.target : 'target'
  const numUpgraded = Object.keys(upgraded).length
  if (numUpgraded === 0 && total === 0 && numErrors === 0) {
    if (Object.keys(current).length === 0) {
      print(options, 'No dependencies.')
    } else if (
      latest &&
      Object.keys(latest).length === 0 &&
      // some specs are ignored by ncu, like the file: protocol, so they should be ignored when detecting fetch issues
      Object.values(filterObject(current, (name, spec) => isFetchable(spec))).length > 0
    ) {
      print(
        options,
        `No package versions were returned. This may be a problem with your installed ${
          options.packageManager
        }, the npm registry, or your Internet connection. Make sure ${chalk.cyan(
          'npx pacote packument ncu-test-v2',
        )} is working before reporting an issue.`,
      )
    } else if (options.global) {
      print(options, `All global packages are up-to-date ${smiley}`)
    } else {
      print(options, `All dependencies match the ${target} package versions ${smiley}`)
    }
  } else if (numUpgraded === 0 && total > 0) {
    print(options, `No dependencies upgraded ${smiley}`)
  }
  // print table
  else if (numUpgraded > 0) {
    await printUpgradesTable(
      {
        current,
        upgraded,
        ownersChangedDeps,
        pkgFile,
        time,
      },
      options,
    )
  }

  printErrors(options, errors)
}

/** Print updates that were ignored due to incompatible peer dependencies. */
export function printIgnoredUpdatesDueToPeerDeps(options: Options, ignoredUpdates: Index<IgnoredUpgradeDueToPeerDeps>) {
  print(options, `\nIgnored incompatible updates (peer dependencies):\n`)
  const table = renderDependencyTable(
    Object.entries(ignoredUpdates).map(([pkgName, { from, to, reason }]) => {
      const strReason =
        'reason: ' +
        Object.entries(reason)
          .map(([pkgReason, requirement]) => pkgReason + ' requires ' + requirement)
          .join(', ')
      return [pkgName, from, '→', colorizeDiff(from, to), strReason]
    }),
  )
  print(options, table)
}

/** Print updates that were ignored due to incompatible engines.node. */
export function printIgnoredUpdatesDueToEnginesNode(
  options: Options,
  ignoredUpdates: Index<IgnoredUpgradeDueToEnginesNode>,
) {
  print(options, `\nIgnored incompatible updates (engines node):\n`)
  const table = renderDependencyTable(
    Object.entries(ignoredUpdates).map(([pkgName, { from, to, enginesNode }]) => [
      pkgName,
      from,
      '→',
      colorizeDiff(from, to),
      `reason: requires node ${enginesNode}`,
    ]),
  )
  print(options, table)
}
