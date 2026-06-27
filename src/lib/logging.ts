/**
 * Logging functions.
 */
import fs from 'node:fs/promises'
import Table from 'cli-table3'
import semver from 'semver'
import { format as timeAgoFormat } from 'timeago.js'
import type { CooldownFunction } from '../types/CooldownFunction'
import { type IgnoredUpgradeDueToEnginesNode } from '../types/IgnoredUpgradeDueToEnginesNode'
import { type IgnoredUpgradeDueToPeerDeps } from '../types/IgnoredUpgradeDueToPeerDeps'
import { type Index } from '../types/IndexType'
import { type Options } from '../types/Options'
import type { CooldownInfo, VersionResult } from '../types/VersionResult'
import { type VersionSpec } from '../types/VersionSpec'
import chalk from './chalk'
import filterObject from './filterObject'
import getPackageJson from './getPackageJson'
import getPackageVersion from './getPackageVersion'
import getRepoUrl from './getRepoUrl'
import isFetchable from './isFetchable'
import { COOLDOWN_PATTERN } from './parseCooldown'
import {
  WILDCARDS,
  colorizeDiff,
  getDependencyGroups,
  getGitHubUrlTag,
  isGitHubUrl,
  isNpmAlias,
  parseNpmAlias,
  stripRange,
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
  return isGitHubUrl(dep) ? getGitHubUrlTag(dep)! : isNpmAlias(dep) ? parseNpmAlias(dep)![1] : dep
}

/** return prettify version from cooldown, `1-day` `20-hour` */
function prettifyCooldown(input: string | number | undefined | CooldownFunction): string {
  if (input === undefined || typeof input === 'function') {
    return 'cooldown'
  }

  const str = String(input).trim().toLowerCase()
  const match = str.match(COOLDOWN_PATTERN)
  const value = match ? Number(match[1]) : Number(str)
  if (isNaN(value)) {
    return 'cooldown'
  }

  const units: Record<string, string> = { d: 'day', h: 'hour', m: 'minute' }
  const unit = match ? units[match[2]] : 'day'
  return `${+value.toFixed(1)}-${unit} cooldown`
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
  skippedByCooldown,
  format,
  ownersChangedDeps,
  pkgFile,
  time,
}: {
  from: Index<VersionSpec>
  to: Index<VersionSpec>
  skippedByCooldown?: Index<CooldownInfo>
  format?: readonly string[]
  ownersChangedDeps?: Index<boolean>
  /** See: logging/getPackageRepo pkgFile param. */
  pkgFile?: string
  time?: Index<string>
}) {
  const pkg = format?.includes('dep') && pkgFile ? JSON.parse(await fs.readFile(pkgFile, 'utf-8')) : null
  const showCooldownCol = Object.keys(skippedByCooldown || {}).length > 0
  const table = renderDependencyTable(
    await Promise.all(
      Object.keys(toDeps)
        .sort()
        .map(async dep => {
          const from =
            (format?.includes('installedVersion')
              ? await getPackageVersion(dep, undefined, { pkgFile })
              : fromDeps[dep]) || ''
          const depType =
            dep in (pkg?.devDependencies ?? {})
              ? 'dev'
              : dep in (pkg?.peerDependencies ?? {})
                ? 'peer'
                : dep in (pkg?.optionalDependencies ?? {})
                  ? 'optional'
                  : ''
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
          const homepageUrl = format?.includes('homepage')
            ? (await getPackageJson(dep, { pkgFile }))?.homepage || ''
            : ''
          const repoUrl = format?.includes('repo') ? (await getRepoUrl(dep, undefined, { pkgFile })) || '' : ''
          const diffUrl = format?.includes('diff')
            ? `${process.env.NCU_DIFF || 'https://npmdiff.dev'}/${encodeURIComponent(dep)}/${from.replace(/^\W+/, '')}/${to.replace(/^\W+/, '')}`
            : ''

          const showCoolDown = format?.includes('cooldown')
          const showTime = format?.includes('time')
          // show '[missing time]' in publishTime column or cooldown column
          const missingTime = (showTime || showCoolDown) && !time?.[dep] ? '[missing time]' : ''
          const timestamp = showTime && time?.[dep] ? time[dep] : null
          const publishTime = timestamp
            ? timeAgoFormat(timestamp, 'en_US')
            : showTime || !showCooldownCol
              ? missingTime
              : ''

          const cooldownVersion = skippedByCooldown?.[dep]?.version
          let cooldown = ''
          if (cooldownVersion) {
            const wildcard = WILDCARDS.includes(to[0]) ? to[0] : ''
            const coerced = semver.coerce(cooldownVersion)
            // Truncate long versions for single-line terminal display.
            // e.g., 1.2.3-alpha.20260503T1728 -> 1.2.3-+
            const shortended =
              coerced && !cooldownVersion.endsWith(coerced.version) ? `${coerced.version}-+` : cooldownVersion
            const skippedColorized = colorizeDiff(to, wildcard + getVersion(shortended))
            cooldown = `[cooldown] ${skippedColorized.replace(wildcard, '')}`
          } else if (showCoolDown && !showTime) {
            cooldown = missingTime
          }

          return [
            dep,
            ...(format?.includes('dep') ? [depType ? chalk.gray(depType) : ''] : []),
            from,
            '→',
            toColorized,
            ...(showCooldownCol ? [cooldown] : []),
            ownerChanged,
            ...[homepageUrl, repoUrl, diffUrl, publishTime].filter(x => x),
          ]
        }),
    ),
  )
  return table
}

/**
 * Renders a color-coded table of skipped upgrades.
 *
 * @param args
 * @param args.skippedByCooldown
 * @param args.pkgFile
 * @param args.options
 */
async function printSkippedByCooldownTable({
  skippedByCooldown,
  pkgFile,
  options,
}: {
  skippedByCooldown?: Index<CooldownInfo>
  pkgFile: any
  options: Options
}) {
  const format = options.format
  if (!skippedByCooldown || !format?.includes('cooldown') || format?.includes('lines')) {
    return
  }

  const currentAfterFallback: Index<string> = {}
  const skippedUpgrades: Index<string> = {}
  const time: Index<string> = {}

  for (const params of Object.values(skippedByCooldown)) {
    const { name, version, currentVersion, fallbackVersion, time: versionTime } = params
    if (!isFetchable(currentVersion) || !version) continue

    const wildcard = WILDCARDS.includes(currentVersion[0]) ? currentVersion[0] : ''
    const caf = wildcard + stripRange(fallbackVersion ?? currentVersion)
    const target = wildcard + stripRange(version)

    currentAfterFallback[name] = caf
    skippedUpgrades[name] = colorizeDiff(caf, target)
    time[name] = versionTime || ''
  }

  if (!Object.keys(currentAfterFallback).length) {
    return false
  }

  const formatWithTime = !format.includes('time') ? [...format, 'time'] : format

  const table = await toDependencyTable({
    from: currentAfterFallback,
    to: skippedUpgrades,
    format: formatWithTime,
    pkgFile: pkgFile || undefined,
    time,
  })

  const cooldown = options.raw?.cooldown ?? options.cooldown
  const heading = chalk.yellow(chalk.bold(`Skipped due to ${prettifyCooldown(cooldown)}`))

  print(options, '\n' + heading)
  print(options, table)
  return true
}

/**
 * Renders one or more color-coded tables with all upgrades. Supports different formats from the --format option.
 *
 * @param args
 * @param args.current
 * @param args.upgraded
 * @param args.skippedByCooldown
 * @param args.ownersChangedDeps
 * @param options
 */
export async function printUpgradesTable(
  {
    current,
    upgraded,
    skippedByCooldown,
    ownersChangedDeps,
    pkgFile,
    time,
  }: {
    current: Index<VersionSpec>
    upgraded: Index<VersionSpec>
    skippedByCooldown?: Index<CooldownInfo>
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
          skippedByCooldown,
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
          skippedByCooldown,
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
 * @param args.skippedByCooldown -
 * @param args.total -
 * @param args.ownersChangedDeps -
 */
export async function printUpgrades(
  options: Options,
  {
    current,
    latest,
    upgraded,
    skippedByCooldown,
    total,
    numCooldown,
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
    // skipped by cooldown info
    skippedByCooldown?: Index<CooldownInfo>
    // The total number of all possible upgrades. This is used to differentiate "no dependencies" from "no upgrades"
    total: number
    // The number of packages skipped due to cooldown.
    numCooldown?: number
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
  const numUpgraded = Object.keys(upgraded).length

  const printed = await printSkippedByCooldownTable({ skippedByCooldown, pkgFile, options })

  if (!options.deep && !options.format?.includes('group')) {
    if (printed && numUpgraded) {
      // print 'Updates' heading after "Skipped due to cooldown" list
      print(options, '\n' + chalk.blue(chalk.bold('Updates')))
    } else {
      print(options, '')
    }
  }

  const smiley = chalk.green.bold(':)')
  const numErrors = Object.keys(errors || {}).length
  const target = typeof options.target === 'string' ? options.target : 'target'
  if (numUpgraded === 0 && total === 0 && numErrors === 0) {
    if (Object.keys(current).length === 0) {
      print(options, 'No dependencies.')
    } else if (
      latest &&
      Object.keys(latest).length === 0 &&
      // packages skipped due to cooldown should not trigger the registry error message
      !numCooldown &&
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
      print(
        options,
        `All dependencies ${numCooldown ? 'not in cooldown ' : ''}match the ${target} package versions ${smiley}`,
      )
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
        skippedByCooldown,
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
