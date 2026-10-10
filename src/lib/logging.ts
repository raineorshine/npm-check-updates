/**
 * Logging functions.
 */
import fs from 'node:fs/promises'
import { stripVTControlCharacters } from 'node:util'
import Table from 'cli-table3'
import ProgressBar from 'progress'
import semver from 'semver'
import { type CooldownFunction } from '../types/CooldownFunction.ts'
import { type IgnoredUpgradeDueToEnginesNode } from '../types/IgnoredUpgradeDueToEnginesNode.ts'
import { type IgnoredUpgradeDueToPeerDeps } from '../types/IgnoredUpgradeDueToPeerDeps.ts'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type CooldownInfo, type IgnoreInfo, type VersionResult } from '../types/VersionResult.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import filterObject from './filterObject.ts'
import formatTimeAgo from './formatTimeAgo.ts'
import getPackageJson from './getPackageJson.ts'
import getRepoUrl from './getRepoUrl.ts'
import isFetchable from './isFetchable.ts'
import { COOLDOWN_PATTERN } from './parseCooldown.ts'
import style from './style.ts'
import {
  colorizeDiff,
  getDependencyGroups,
  getGitHubUrlTag,
  isGitHubUrl,
  isNpmAlias,
  parseNpmAlias,
  shortenBuildMetadata,
  stripRange,
} from './version-util.ts'

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'silly' | null

/** Returns the leading ^ or ~ of a version spec, or an empty string. */
const leadingWildcard = (spec: string) => (spec[0] === '^' || spec[0] === '~' ? spec[0] : '')

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
    (loglevel == null || logLevels[(options.loglevel ?? 'warn') as keyof typeof logLevels] >= logLevels[loglevel])
  ) {
    console[method](message)
  }
}

/** Strips escape sequences and control characters from package- and registry-supplied text. Wrap the untrusted substring, not a finished message, since styleText styling uses escape sequences too. */
export function sanitizeForDisplay(str: string): string {
  // stripVTControlCharacters leaves bare control characters like CR, which can overwrite a rendered line
  // eslint-disable-next-line no-control-regex
  return stripVTControlCharacters(str).replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
}

/** Converts a caught value to sanitized, displayable text, since it usually originates from a registry or package manager. */
export function errorText(err: unknown): string {
  return sanitizeForDisplay(err instanceof Error ? (err.stack ?? err.message) : String(err))
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

/** Creates and renders a progress bar, or returns undefined if progress should not be shown. */
export function createProgressBar(options: Options, total: number): ProgressBar | undefined {
  if (options.json || options.loglevel === 'silent' || options.loglevel === 'verbose' || total <= 0) return
  const bar = new ProgressBar('[:bar] :current/:total :percent', { total, width: 20 })
  bar.render()
  return bar
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
 * Extract just the version number from a package.json dep.
 *
 * @param dep Raw dependency, could be version / npm: string / Git url
 */
function getVersion(dep: string): string {
  return isGitHubUrl(dep) ? getGitHubUrlTag(dep)! : isNpmAlias(dep) ? parseNpmAlias(dep)![1] : dep
}

/** Returns true if the format asks for held-back versions. `cooldown` is an alias for `skipped`. */
function includesSkippedFormat(format: readonly string[] | undefined): boolean {
  return !!format && (format.includes('skipped') || format.includes('cooldown'))
}

/** Renders the inline label for a held-back version, e.g. `[cooldown] 2.0.0`. */
function heldBackLabel(label: string, to: string, version: string): string {
  const wildcard = leadingWildcard(to)
  const coerced = semver.coerce(version)
  // Truncate long versions for single-line terminal display.
  // e.g., 1.2.3-alpha.20260503T1728 -> 1.2.3-+
  const shortened = coerced && !version.endsWith(coerced.version) ? `${coerced.version}-+` : version
  const colorized = colorizeDiff(to, wildcard + getVersion(shortened))
  return `[${label}] ${colorized.replace(wildcard, '')}`
}

/** Prettifies a cooldown value, e.g. `1-day` `20-hour`. */
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
  skippedByIgnore,
  cooldownActive,
  format,
  ownersChangedDeps,
  pkgFile,
  time,
}: {
  from: Index<VersionSpec>
  to: Index<VersionSpec>
  skippedByCooldown?: Index<CooldownInfo>
  skippedByIgnore?: Index<IgnoreInfo>
  // whether a cooldown is active. Rows without a publish time are marked only then, since times are fetched only for cooldown.
  cooldownActive?: boolean
  format?: readonly string[]
  ownersChangedDeps?: Index<boolean>
  /** See: logging/getPackageRepo pkgFile param. */
  pkgFile?: string
  time?: Index<string>
}) {
  const pkg = format?.includes('dep') && pkgFile ? JSON.parse(await fs.readFile(pkgFile, 'utf-8')) : null
  // the cooldown label shows by default; the ignore label only with --format skipped
  const showIgnoredLabel = includesSkippedFormat(format) && Object.keys(skippedByIgnore || {}).length > 0
  const showCooldownCol = Object.keys(skippedByCooldown || {}).length > 0 || showIgnoredLabel
  const table = renderDependencyTable(
    await Promise.all(
      Object.keys(toDeps)
        .sort()
        .map(async dep => {
          // load once and share between installedVersion, homepage, and repo to avoid reading the same package.json multiple times
          const packageJson =
            format?.includes('installedVersion') || format?.includes('homepage') || format?.includes('repo')
              ? await getPackageJson(dep, { pkgFile })
              : null
          // node_modules can hold a bogus version, so fall back to the declared spec.
          // semver.valid tolerates padding like a trailing CR, so that is checked separately.
          const installedVersion = format?.includes('installedVersion') ? packageJson?.version : undefined
          const installedIsClean =
            !!installedVersion && installedVersion.trim() === installedVersion && !!semver.valid(installedVersion)
          const from = (installedIsClean ? installedVersion : fromDeps[dep]) || ''
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
          const toColorized = colorizeDiff(getVersion(from), shortenBuildMetadata(to))
          const homepageUrl = format?.includes('homepage') ? sanitizeForDisplay(packageJson?.homepage || '') : ''
          const repoUrl = format?.includes('repo')
            ? sanitizeForDisplay((await getRepoUrl(dep, packageJson ?? undefined, { pkgFile })) || '')
            : ''
          const diffUrl = format?.includes('diff')
            ? `${process.env.NCU_DIFF || 'https://npmdiff.dev'}/${encodeURIComponent(dep)}/${from.replace(/^\W+/, '')}/${to.replace(/^\W+/, '')}`
            : ''

          const showSkipped = includesSkippedFormat(format) && (cooldownActive ?? true)
          const showTime = format?.includes('time')
          // show '[missing time]' in publishTime column or cooldown column
          const missingTime = (showTime || showSkipped) && !time?.[dep] ? '[missing time]' : ''
          const timestamp = showTime && time?.[dep] ? time[dep] : null
          const publishTime = timestamp ? formatTimeAgo(timestamp) : showTime || !showCooldownCol ? missingTime : ''

          const cooldownVersion = skippedByCooldown?.[dep]?.version
          const ignoredVersion = showIgnoredLabel ? skippedByIgnore?.[dep]?.version : undefined
          let heldBack = [
            cooldownVersion ? heldBackLabel('cooldown', to, cooldownVersion) : '',
            ignoredVersion ? heldBackLabel('ignored', to, ignoredVersion) : '',
          ]
            .filter(Boolean)
            .join(' ')
          if (!heldBack && showSkipped && !showTime) {
            heldBack = missingTime
          }

          return [
            dep,
            ...(format?.includes('dep') ? [depType ? style.gray(depType) : ''] : []),
            shortenBuildMetadata(from),
            '→',
            toColorized,
            ...(showCooldownCol ? [heldBack] : []),
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
 * @param args.skippedByIgnore
 * @param args.upgraded
 * @param args.pkgFile
 * @param args.options
 */
async function printSkippedTable({
  skippedByCooldown,
  skippedByIgnore,
  upgraded,
  pkgFile,
  options,
}: {
  skippedByCooldown?: Index<CooldownInfo>
  skippedByIgnore?: Index<IgnoreInfo>
  upgraded?: Index<VersionSpec>
  pkgFile: any
  options: Options
}) {
  const format = options.format
  if (!format || !includesSkippedFormat(format) || format.includes('lines')) {
    return
  }

  const cooldown = options.raw?.cooldown ?? options.cooldown

  // with ignore rows, one table lists every cause; otherwise the cooldown table is unchanged
  if (Object.keys(skippedByIgnore || {}).length > 0) {
    const rows: { name: string; row: string[] }[] = []

    for (const { name, version, currentVersion, fallbackVersion, time: versionTime } of Object.values(
      skippedByCooldown || {},
    )) {
      if (!isFetchable(currentVersion) || !version) continue
      const wildcard = leadingWildcard(currentVersion)
      const from = wildcard + stripRange(fallbackVersion ?? currentVersion)
      rows.push({
        name,
        row: [
          name,
          from,
          '→',
          colorizeDiff(from, wildcard + stripRange(version)),
          prettifyCooldown(cooldown),
          versionTime ? formatTimeAgo(versionTime) : '',
        ],
      })
    }

    for (const [dep, { currentVersion, version, reason }] of Object.entries(skippedByIgnore || {})) {
      if (!isFetchable(currentVersion)) continue
      const wildcard = leadingWildcard(currentVersion)
      const from = wildcard + stripRange(getVersion(upgraded?.[dep] ?? currentVersion))
      rows.push({
        name: dep,
        row: [
          dep,
          from,
          '→',
          colorizeDiff(from, wildcard + version),
          `ignored${reason ? `: ${sanitizeForDisplay(reason)}` : ''}`,
          '',
        ],
      })
    }

    if (!rows.length) return false

    rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    print(options, '\n' + style.yellow(style.bold('Skipped')))
    print(options, renderDependencyTable(rows.map(({ row }) => row)))
    return true
  }

  if (!skippedByCooldown) return

  const currentAfterFallback: Index<string> = {}
  const skippedUpgrades: Index<string> = {}
  const time: Index<string> = {}

  for (const params of Object.values(skippedByCooldown)) {
    const { name, version, currentVersion, fallbackVersion, time: versionTime } = params
    if (!isFetchable(currentVersion) || !version) continue

    const wildcard = leadingWildcard(currentVersion)
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

  const heading = style.yellow(style.bold(`Skipped due to ${prettifyCooldown(cooldown)}`))

  print(options, '\n' + heading)
  print(options, table)
  return true
}

/**
 * Renders one or more color-coded tables with all upgrades. Supports different formats from the `--format` option.
 *
 * @param args
 * @param args.current
 * @param args.upgraded
 * @param args.skippedByCooldown
 * @param args.skippedByIgnore
 * @param args.ownersChangedDeps
 * @param options
 */
export async function printUpgradesTable(
  {
    current,
    upgraded,
    skippedByCooldown,
    skippedByIgnore,
    ownersChangedDeps,
    pkgFile,
    time,
  }: {
    current: Index<VersionSpec>
    upgraded: Index<VersionSpec>
    skippedByCooldown?: Index<CooldownInfo>
    skippedByIgnore?: Index<IgnoreInfo>
    ownersChangedDeps?: Index<boolean>
    pkgFile?: string
    time?: Index<string>
  },
  options: Options,
) {
  // group
  if (options.format?.includes('group')) {
    const groups = getDependencyGroups(upgraded, current, options)

    // build the tables in parallel so per-group disk reads (e.g. --format repo) overlap, then print in order
    const rendered = await Promise.all(
      groups.map(async ({ heading, packages }) => ({
        heading,
        table: await toDependencyTable({
          from: current,
          to: packages,
          skippedByCooldown,
          skippedByIgnore,
          cooldownActive: !!options.cooldown,
          format: options.format,
          ownersChangedDeps,
          pkgFile,
          time,
        }),
      })),
    )

    for (const { heading, table } of rendered) {
      print(options, '\n' + heading)
      print(options, table)
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
          skippedByIgnore,
          cooldownActive: !!options.cooldown,
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
    const rows = Object.entries(errors).map(([dep, error]) => [dep, style.yellow(sanitizeForDisplay(error))])
    print(options, '\n' + renderDependencyTable(rows))
  }
}

/**
 * @param args.current -
 * @param args.latest -
 * @param args.upgraded -
 * @param args.skippedByCooldown -
 * @param args.skippedByIgnore -
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
    skippedByIgnore,
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
    // versions held back by ignore rules
    skippedByIgnore?: Index<IgnoreInfo>
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

  const printed = await printSkippedTable({ skippedByCooldown, skippedByIgnore, upgraded, pkgFile, options })

  if (!options.deep && !options.format?.includes('group')) {
    if (printed && numUpgraded) {
      // print 'Updates' heading after "Skipped due to cooldown" list
      print(options, '\n' + style.blue(style.bold('Updates')))
    } else {
      print(options, '')
    }
  }

  const smiley = style.green.bold(':)')
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
        }, the npm registry, or your Internet connection. Make sure ${style.cyan(
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
        skippedByIgnore,
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
      const strReason = sanitizeForDisplay(
        'reason: ' +
          Object.entries(reason)
            .map(([pkgReason, requirement]) => pkgReason + ' requires ' + requirement)
            .join(', '),
      )
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
      `reason: requires node ${sanitizeForDisplay(enginesNode)}`,
    ]),
  )
  print(options, table)
}
