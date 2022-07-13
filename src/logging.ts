/**
 * Loggin functions.
 */
import Chalk from 'chalk'
import Table from 'cli-table'
import getRepoUrl from './lib/getRepoUrl'
import { IgnoredUpgrade } from './types/IgnoredUpgrade'
import { Index } from './types/IndexType'
import { Options } from './types/Options'
import { Version } from './types/Version'
import { VersionSpec } from './types/VersionSpec'
import {
  colorizeDiff,
  getDependencyGroups,
  getGithubUrlTag,
  isGithubUrl,
  isNpmAlias,
  parseNpmAlias,
} from './version-util'

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
  loglevel: 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'silly' | null = null,
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
    rows,
    // TODO: Submit a PR for rows in @types/cli-table
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/cli-table/index.d.ts
  } as any)

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
  ownersChangedDeps,
  format,
}: {
  from: Index<VersionSpec>
  to: Index<VersionSpec>
  ownersChangedDeps?: Index<boolean>
  format?: string[]
}) {
  const table = renderDependencyTable(
    await Promise.all(
      Object.keys(toDeps).map(async dep => {
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
        const repoUrl = format?.includes('repo') ? (await getRepoUrl(dep)) || '' : ''
        return [dep, from, '→', toColorized, ownerChanged, repoUrl]
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
 * @param args.latest
 * @param args.ownersChangedDeps
 * @param options
 */
export async function printUpgradesTable(
  {
    current,
    upgraded,
    latest,
    ownersChangedDeps,
  }: {
    current: Index<VersionSpec>
    upgraded: Index<VersionSpec>
    latest: Index<Version>
    ownersChangedDeps?: Index<boolean>
  },
  options: Options,
) {
  // group
  if (options.format?.includes('group')) {
    const groups = getDependencyGroups(latest, current, options)

    // eslint-disable-next-line fp/no-loops -- We must await in each iteration of the loop
    for (const { heading, packages } of groups) {
      print(options, '\n' + heading)
      print(
        options,
        await toDependencyTable({
          from: current,
          to: packages,
          ownersChangedDeps,
          format: options.format,
        }),
      )
    }
  } else {
    print(
      options,
      await toDependencyTable({
        from: current,
        to: upgraded,
        ownersChangedDeps,
        format: options.format,
      }),
    )
  }
}

/** Prints errors. */
function printErrors(options: Options, errors?: Index<string>) {
  if (!errors) return
  if (Object.keys(errors).length > 0) {
    const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk
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
      rows: Object.entries(errors!).map(([dep, error]) => [dep, chalk.yellow(error)]),
      // coerce type until rows is added @types/cli-table
      // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/cli-table/index.d.ts
    } as any)

    print(options, '\n' + errorTable.toString())
  }
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
export async function printUpgrades(
  options: Options,
  {
    current,
    latest,
    upgraded,
    total,
    ownersChangedDeps,
    errors,
  }: {
    current: Index<VersionSpec>
    latest: Index<Version>
    upgraded: Index<VersionSpec>
    total: number
    ownersChangedDeps?: Index<boolean>
    errors?: Index<string>
  },
) {
  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  if (!options.format?.includes('group')) {
    print(options, '')
  }

  // print everything is up-to-date
  const smiley = chalk.green.bold(':)')
  const numErrors = Object.keys(errors || {}).length
  const target = typeof options.target === 'string' ? options.target : 'target'
  const numUpgraded = Object.keys(upgraded).length
  if (numUpgraded === 0 && total === 0 && numErrors === 0) {
    if (Object.keys(current).length === 0) {
      print(options, 'No dependencies.')
    } else if (latest && Object.keys(latest).length === 0) {
      print(
        options,
        `No package versions were returned. This is likely a problem with your installed ${
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
        latest,
        ownersChangedDeps,
      },
      options,
    )
  }

  printErrors(options, errors)
}

/** Print updates that were ignored due to incompatible peer dependencies. */
export function printIgnoredUpdates(options: Options, ignoredUpdates: Index<IgnoredUpgrade>) {
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
