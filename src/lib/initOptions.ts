import picomatch from 'picomatch'
import cliOptions from '../cli-options.ts'
import { print } from '../lib/logging.ts'
import packageManagers from '../package-managers/index.ts'
import { npmApi } from '../package-managers/npm.ts'
import { pnpmApi } from '../package-managers/pnpm.ts'
import { yarnApi } from '../package-managers/yarn.ts'
import { type FilterPattern } from '../types/FilterPattern.ts'
import { type Options } from '../types/Options.ts'
import { type RunOptions } from '../types/RunOptions.ts'
import { type Target } from '../types/Target.ts'
import cacher from './cache.ts'
import { getChalk } from './chalk.ts'
import determinePackageManager from './determinePackageManager.ts'
import exists from './exists.ts'
import keyValueBy from './keyValueBy.ts'
import parseCooldown from './parseCooldown.ts'
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
    const filtered = filterExpression.map(s => (typeof s === 'string' ? s.trim() : s)).filter(Boolean)
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

/** pretty print for days `3.4722222222222223 days` -> `3.5 days` */
const formatDays = (d: number, r = Math.round(d * 10) / 10) => `${r} day${r !== 1 ? 's' : ''}`

/** Initializes, validates, sets defaults, and consolidates program options. */
async function initOptions(runOptions: RunOptions, { cli }: { cli?: boolean } = {}): Promise<Options> {
  const chalk = getChalk(runOptions.color)

  let raw: RunOptions | undefined

  // if not executed on the command-line (i.e. executed as a node module), set the defaults
  if (!cli) {
    raw = { ...runOptions }

    // set cli defaults since they are not set by commander in this case
    const cliDefaults: Record<string, unknown> = {}
    for (const curr of cliOptions) {
      if (curr.default != null) {
        cliDefaults[curr.long] = curr.default
      }
    }

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
    ...(cli ? null : { raw }),
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
    if (values.every(value => !choices.includes(value))) {
      programError(options, `Invalid option value: --${long} ${value}. Valid values are: ${choices.join(', ')}.`)
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
    // Normalize string formats ("7d", "12h", "30m") to a fractional number of days.
    if (typeof options.cooldown === 'string') {
      const days = parseCooldown(options.cooldown)
      if (days === null) {
        programError(
          options,
          `Invalid cooldown value: "${options.cooldown}". Use a number (days) or a string like "7d", "12h", or "30m".`,
        )
      } else {
        options.cooldown = days
      }
    }

    const isValidNumber =
      typeof options.cooldown === 'number' && !Number.isNaN(options.cooldown) && options.cooldown >= 0
    const isValidFunction = typeof options.cooldown === 'function'

    if (!isValidNumber && !isValidFunction) {
      programError(
        options,
        'Cooldown must be a non-negative number (days), a string like "7d", "12h", or "30m", or a predicate function.',
      )
    }
  } else {
    if (packageManager === 'pnpm') {
      // Automatically apply pnpm's minimumReleaseAge from pnpm-workspace.yaml as cooldown if cooldown is not explicitly set.
      // pnpm does not read .npmrc min-release-age; only consult pnpm's own native config.
      const pnpmWorkspaceConfig = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()
      if (pnpmWorkspaceConfig != null) {
        const { minimumReleaseAge, minimumReleaseAgeExclude } = pnpmWorkspaceConfig
        // pnpm's minimumReleaseAge is in minutes; convert to days
        const MINUTES_PER_DAY = 24 * 60
        const days = minimumReleaseAge / MINUTES_PER_DAY
        if (minimumReleaseAgeExclude.length > 0) {
          const matchers = minimumReleaseAgeExclude.map(pattern => picomatch(pattern))
          options.cooldown = (packageName: string) => (matchers.some(m => m(packageName)) ? null : days)
          print(
            { ...options, json },
            `Using minimumReleaseAge from pnpm-workspace.yaml: ${formatDays(days)} (${minimumReleaseAgeExclude.length} excluded pattern${minimumReleaseAgeExclude.length !== 1 ? 's' : ''})`,
          )
        } else {
          options.cooldown = days
          print({ ...options, json }, `Using minimumReleaseAge from pnpm-workspace.yaml: ${formatDays(days)}`)
        }
      }
    } else if (packageManager === 'yarn') {
      // Automatically apply yarn's npmMinimalAgeGate from .yarnrc.yml as cooldown if cooldown is not explicitly set.
      // yarn does not read .npmrc min-release-age; only consult yarn's own native config.
      const yarnAgeGateConfig = await yarnApi.getYarnMinimalAgeGate(options)
      if (yarnAgeGateConfig != null) {
        const { npmMinimalAgeGate, npmPreapprovedPackages } = yarnAgeGateConfig
        // yarn's npmMinimalAgeGate is in minutes; convert to days
        const MINUTES_PER_DAY = 24 * 60
        const days = npmMinimalAgeGate / MINUTES_PER_DAY
        if (npmPreapprovedPackages.length > 0) {
          const matchers = npmPreapprovedPackages.map(pattern => picomatch(pattern))
          // Returning null skips the cooldown check for pre-approved packages
          options.cooldown = (packageName: string) => (matchers.some(m => m(packageName)) ? null : days)
          print(
            { ...options, json },
            `Using npmMinimalAgeGate from .yarnrc.yml: ${days} day${days !== 1 ? 's' : ''} (${npmPreapprovedPackages.length} pre-approved package${npmPreapprovedPackages.length !== 1 ? 's' : ''})`,
          )
        } else {
          options.cooldown = days
          print({ ...options, json }, `Using npmMinimalAgeGate from .yarnrc.yml: ${formatDays(days)}`)
        }
      }
    } else {
      // Automatically apply npm's min-release-age config as cooldown if cooldown is not explicitly set.
      // This applies to npm and any unknown/unset package manager.
      const npmConfigCooldown = npmApi.findNpmConfig()
      const minReleaseAge = npmConfigCooldown?.minReleaseAge
      if (minReleaseAge != null) {
        const days =
          typeof minReleaseAge === 'string'
            ? (parseCooldown(minReleaseAge) ?? Number.parseInt(minReleaseAge, 10))
            : typeof minReleaseAge === 'number'
              ? minReleaseAge
              : null
        if (days != null && !Number.isNaN(days)) {
          // npm's min-release-age-exclude is a list of package names or glob patterns that are exempt from min-release-age.
          // a single .npmrc entry parses as a string; repeated entries (min-release-age-exclude[]=) parse as an array.
          const minReleaseAgeExcludeRaw = npmConfigCooldown?.minReleaseAgeExclude
          const minReleaseAgeExclude = [
            ...new Set(
              (Array.isArray(minReleaseAgeExcludeRaw)
                ? minReleaseAgeExcludeRaw
                : typeof minReleaseAgeExcludeRaw === 'string'
                  ? [minReleaseAgeExcludeRaw]
                  : []
              )
                .flatMap(pattern => pattern.split(','))
                .map(pattern => pattern.trim())
                .filter(Boolean),
            ),
          ]
          if (minReleaseAgeExclude.length > 0) {
            const matchers = minReleaseAgeExclude.map(pattern => ({
              pattern,
              match: picomatch(pattern, { nonegate: true, noext: true }),
            }))
            // returning null skips the cooldown check for excluded packages
            options.cooldown = (packageName: string) =>
              matchers.some(({ pattern, match }) => packageName === pattern || match(packageName)) ? null : days
            print(
              { ...options, json },
              `Using min-release-age from .npmrc: ${formatDays(days)} (${minReleaseAgeExclude.length} excluded pattern${minReleaseAgeExclude.length !== 1 ? 's' : ''})`,
            )
          } else {
            options.cooldown = days
            print({ ...options, json }, `Using min-release-age from .npmrc: ${formatDays(days)}`)
          }
        }
      }
    }
  }

  const target: Target = options.target || 'latest'

  const autoPre = target === 'newest' || target === 'greatest'

  const resolvedOptions: Options = {
    ...options,
    ...(options.deep ? { packageFile: '**/package.json' } : null),
    ...(packageManager === 'deno' ? { dep: ['imports'] } : null),
    ...(options.format && options.format.length > 0 ? { format: options.format } : null),
    filter: args || filter,
    filterVersion,
    // add shortcut for any keys that start with 'json'
    json,
    loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to false, except when newest or greatest are set
    // this is overridden on a per-dependency basis in queryVersions to allow prereleases to be upgraded to newer prereleases
    ...(options.pre != null || autoPre ? { pre: options.pre != null ? !!options.pre : autoPre } : null),
    reject,
    rejectVersion,
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
