import picomatch from 'picomatch'
import cliOptions from '../cli-options.ts'
import { print } from '../lib/logging.ts'
import packageManagers from '../package-managers/index.ts'
import { type CooldownFunction } from '../types/CooldownFunction.ts'
import { type FilterPattern } from '../types/FilterPattern.ts'
import { type Options } from '../types/Options.ts'
import { type RunOptions } from '../types/RunOptions.ts'
import { type Target } from '../types/Target.ts'
import cacher from './cache.ts'
import { getChalk } from './chalk.ts'
import determinePackageManager from './determinePackageManager.ts'
import exists from './exists.ts'
import keyValueBy from './keyValueBy.ts'
import programError from './programError.ts'

function parseFilterExpression(filterExpression: string[] | undefined): string[] | undefined
function parseFilterExpression(filterExpression: FilterPattern | undefined): FilterPattern | undefined
/** Trims and filters out empty values from a filter expression. */
function parseFilterExpression(filterExpression: FilterPattern | undefined): FilterPattern | undefined {
  if (typeof filterExpression === 'string') {
    return filterExpression.trim()
  } else if (
    Array.isArray(filterExpression) &&
    (filterExpression.length === 0 || typeof filterExpression[0] === 'string')
  ) {
    const filtered = filterExpression.map(s => (typeof s === 'string' ? s.trim() : s)).filter(x => x)
    return filtered.length > 0 ? filtered : undefined
  } else {
    return filterExpression
  }
}

/** Checks if a string is a valid URL. */
function isValidUrl(url: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  } catch {
    return false
  }
}

/** Pretty print for days, `3.4722222222222223 days` -> `3.5 days`. */
const formatDays = (d: number, r = Math.round(d * 10) / 10) => `${r} day${r !== 1 ? 's' : ''}`

/** Builds the cooldown value and log message for a package manager's native cooldown config. */
const nativeCooldown = (
  days: number,
  exclude: string[],
  {
    source,
    excludeLabel,
    createMatcher = pattern => picomatch(pattern),
  }: {
    source: string
    excludeLabel: string
    createMatcher?: (pattern: string) => (packageName: string) => boolean
  },
): [CooldownFunction | number, string] => {
  if (exclude.length === 0) return [days, `Using ${source}: ${formatDays(days)}`]

  const matchers = exclude.map(createMatcher)
  // returning null skips the cooldown check for excluded packages
  return [
    (packageName: string) => (matchers.some(match => match(packageName)) ? null : days),
    `Using ${source}: ${formatDays(days)} (${exclude.length} ${excludeLabel}${exclude.length !== 1 ? 's' : ''})`,
  ]
}

/** Initializes, validates, sets defaults, and consolidates program options. */
async function initOptions(runOptions: RunOptions, { cli }: { cli?: boolean } = {}): Promise<Options> {
  const chalk = getChalk(runOptions.color)

  let raw: RunOptions | undefined
  // long names of options passed to the ncu module, used to keep them ahead of per-package
  // .ncurc configs reloaded in --deep mode (the cli sets this in cli.ts instead)
  let moduleCliKeys: string[] | undefined

  // if not executed on the command-line (i.e. executed as a node module), set the defaults
  if (!cli) {
    raw = { ...runOptions }
    moduleCliKeys = Object.keys(runOptions)

    // set cli defaults since they are not set by commander in this case
    const cliDefaults = keyValueBy(cliOptions, option =>
      option.default != null ? { [option.long]: option.default } : null,
    )

    // set default options that are specific to module usage
    const moduleDefaults: Options = {
      jsonUpgraded: true,
      silent: runOptions.silent || (runOptions.loglevel === undefined && !runOptions.verbose),
      args: [],
    }

    runOptions = { ...cliDefaults, ...moduleDefaults, ...runOptions }
  }

  // convert packageData to string to convert RunOptions to Options
  const options: Options = {
    ...runOptions,
    ...(runOptions.packageData && typeof runOptions.packageData !== 'string'
      ? { packageData: JSON.stringify(runOptions.packageData, null, 2) as any }
      : null),
    cli,
    ...(cli ? null : { raw, cliKeys: moduleCliKeys }),
  }

  // The cli path already went through commander, which applies parse. Values coming from the ncurc or
  // the module API have not, so coerce them here from the same option definitions.
  const rawCooldown = options.cooldown
  for (const option of cliOptions) {
    const { parse, accumulate } = option
    if (!parse || accumulate) continue
    const key = option.long as keyof Options
    const value = options[key]
    // defaults are already in their coerced form, and commander does not parse them either
    if (value === undefined || value === option.default) continue
    try {
      options[key] = parse(value) as never
    } catch (err: any) {
      programError(options, err.message || err)
    }
  }

  // consolidate loglevel
  const loglevel =
    options.silent || options.format?.includes('lines') ? 'silent' : options.verbose ? 'verbose' : options.loglevel

  const json = Object.keys(options)
    .filter(option => option.startsWith('json'))
    .some(option => options[option as keyof Options])

  if (!json && loglevel !== 'silent' && options.rcConfigPath && !options.doctor) {
    print(options, `Using config file ${options.rcConfigPath}`)
  }

  // warn about deprecated options
  const deprecatedOptions = cliOptions.filter(
    ({ long, deprecated }) =>
      (deprecated && options[long as keyof Options]) ||
      // special case to deprecate a value but not the entire option
      (long === 'packageManager' && options.packageManager === 'staticRegistry'),
  )
  if (deprecatedOptions.length > 0) {
    for (const { long, description } of deprecatedOptions) {
      const deprecationMessage =
        long === 'packageManager'
          ? '--packageManager staticRegistry is deprecated. Use --registryType json.'
          : `--${long}: ${description}`
      print(options, chalk.yellow(deprecationMessage), 'warn')
    }
    print(options, '', 'warn')
  }

  // validate options with predefined choices
  for (const { long, choices } of cliOptions) {
    if (!choices || choices.length === 0) continue
    const value = options[long as keyof Options]
    const values = Array.isArray(value) ? value : [value]
    if (values.length === 0) continue
    // make sure the option value is valid
    // if an array of values is given, make sure each one is a valid choice
    const invalid = values.filter(value => !choices.includes(value))
    if (invalid.length > 0) {
      programError(
        options,
        `Invalid option value: --${long} ${invalid.join(',')}. Valid values are: ${choices.join(', ')}.`,
      )
    }
  }

  // validate options.cwd
  if (options.cwd && !(await exists(options.cwd))) {
    programError(options, `No such directory: ${options.cwd}`)
  }

  // trim filter args
  // disallow non-matching filter and args
  const args = parseFilterExpression(options.args)
  const filter = parseFilterExpression(options.filter)
  const filterVersion = parseFilterExpression(options.filterVersion)
  const reject = parseFilterExpression(options.reject)
  const rejectVersion = parseFilterExpression(options.rejectVersion)
  const registryType = options.registryType || (options.registry?.endsWith('.json') ? 'json' : 'npm')

  // convert to string for comparison purposes
  // otherwise ['a b'] will not match ['a', 'b']
  if (options.filter && args && args.join(' ') !== (Array.isArray(filter) ? filter.join(' ') : filter)) {
    programError(
      options,
      'Cannot specify a filter using both --filter and args. Did you forget to quote an argument?\nSee: https://github.com/raineorshine/npm-check-updates/issues/759#issuecomment-723587297',
    )
  }
  // disallow packageFile and --deep
  else if (options.packageFile && options.deep) {
    programError(
      options,
      `Cannot specify both --packageFile and --deep. --deep is an alias for --packageFile '**/package.json'`,
    )
  }
  // disallow --format lines and --jsonUpgraded
  else if (options.format?.includes('lines') && options.jsonUpgraded) {
    programError(options, 'Cannot specify both --format lines and --jsonUpgraded.')
  } else if (options.format?.includes('lines') && options.jsonAll) {
    programError(options, 'Cannot specify both --format lines and --jsonAll.')
  } else if (options.format?.includes('lines') && options.format.length > 1) {
    programError(options, 'Cannot use --format lines with other formatting options.')
  }
  // disallow --workspace and --workspaces
  else if (options.workspace?.length && options.workspaces) {
    programError(options, 'Cannot specify both --workspace and --workspaces.')
  }
  // disallow --workspace(s) and --deep
  else if (options.deep && (options.workspace?.length || options.workspaces)) {
    programError(options, `Cannot specify both --deep and --workspace${options.workspaces ? 's' : ''}.`)
  }
  // disallow --workspace(s) and --doctor
  else if (options.doctor && (options.workspace?.length || options.workspaces)) {
    programError(options, `Doctor mode is not currently supported with --workspace${options.workspaces ? 's' : ''}.`)
  }
  // disallow missing registry path when using registryType
  else if (options.packageManager === 'staticRegistry' && !options.registry) {
    programError(
      options,
      'When --package-manager staticRegistry is specified, you must provide the path for the registry file with --registry.',
    )
  } else if (options.registryType === 'json' && !options.registry) {
    programError(
      options,
      'When --registryType json is specified, you must provide the path for the registry file with --registry. Run "ncu --help registryType" for details.',
    )
  } else if (registryType !== 'json' && options.registry && !isValidUrl(options.registry)) {
    programError(options, `--registry must be a valid URL. Invalid value: "${options.registry}"`)
  }

  const packageManager = await determinePackageManager(options)

  if (options.cooldown != null) {
    // the option's parse already normalized "7d"/"12h"/"30m" to a fractional number of days, and
    // yields NaN for a string it could not read
    if (typeof rawCooldown === 'string' && typeof options.cooldown === 'number' && isNaN(options.cooldown)) {
      programError(
        options,
        `Invalid cooldown value: "${rawCooldown}". Use a number (days) or a string like "7d", "12h", or "30m".`,
      )
    }

    const isValidNumber = typeof options.cooldown === 'number' && !isNaN(options.cooldown) && options.cooldown >= 0
    const isValidFunction = typeof options.cooldown === 'function'

    if (!isValidNumber && !isValidFunction) {
      programError(
        options,
        'Cooldown must be a non-negative number (days), a string like "7d", "12h", or "30m", or a predicate function.',
      )
    }
  } else {
    // Apply the package manager's own cooldown setting when --cooldown is not explicitly set.
    // Managers without a native setting fall back to npm's .npmrc min-release-age.
    const getCooldown = packageManagers[packageManager]?.getCooldown ?? packageManagers.npm.getCooldown!
    const native = await getCooldown(options)
    if (native) {
      const [cooldown, message] = nativeCooldown(native.days, native.exclude, native)
      options.cooldown = cooldown
      print({ ...options, json }, message)
    }
  }

  const target: Target = options.target || 'latest'

  const autoPre = target === 'newest' || target === 'greatest'

  const resolvedOptions: Options = {
    ...options,
    ...(options.deep ? { packageFile: '**/package.json' } : null),
    // deno reads its import map from `imports`, but Deno 2.0 can also use package.json,
    // so keep the standard sections too for the package.json fallback
    ...(packageManager === 'deno' ? { dep: ['imports', 'prod', 'dev', 'optional', 'packageManager'] } : null),
    ...(options.format && options.format.length > 0 ? { format: options.format } : null),
    filter: args || filter,
    filterVersion: filterVersion as Options['filterVersion'],
    // add shortcut for any keys that start with 'json'
    json,
    loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to false, except when newest or greatest are set
    // this is overridden on a per-dependency basis in queryVersions to allow prereleases to be upgraded to newer prereleases
    ...(options.pre != null || autoPre ? { pre: options.pre != null ? !!options.pre : autoPre } : null),
    reject,
    rejectVersion: rejectVersion as Options['rejectVersion'],
    target,
    // imply upgrade in interactive mode when json is not specified as the output
    ...(options.interactive && options.upgrade === undefined ? { upgrade: !json } : null),
    packageManager,
    ...(options.prefix
      ? {
          // use the npm prefix if the package manager does not define defaultPrefix
          prefix: await (packageManagers[packageManager || '']?.defaultPrefix || packageManagers.npm.defaultPrefix!)(
            options,
          ),
        }
      : null),
    registryType,
  }
  resolvedOptions.cacher = await cacher(resolvedOptions)

  // remove undefined values
  const resolvedOptionsFiltered: Options = keyValueBy(
    resolvedOptions as { [key: string]: Options[keyof Options] },
    (key, value) => (value !== undefined ? { [key]: value } : null),
  )

  // print 'Using yarn/pnpm/etc' when autodetected
  // use resolved options so that options.json is set
  if (!options.packageManager && packageManager !== 'npm') {
    print(resolvedOptionsFiltered, `Using ${packageManager}`)
  }

  return resolvedOptionsFiltered
}

export default initOptions
