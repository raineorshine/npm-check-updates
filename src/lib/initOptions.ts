import isEqual from 'lodash/isEqual'
import propertyOf from 'lodash/propertyOf'
import cliOptions, { cliOptionsMap } from '../cli-options'
import { print } from '../lib/logging'
import { FilterPattern } from '../types/FilterPattern'
import { Options } from '../types/Options'
import { RunOptions } from '../types/RunOptions'
import { Target } from '../types/Target'
import cacher from './cache'
import determinePackageManager from './determinePackageManager'
import exists from './exists'
import programError from './programError'

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
    const filtered = (filterExpression as string[]).map(s => s.trim()).filter(x => x)
    return filtered.length > 0 ? filtered : undefined
  } else {
    return filterExpression
  }
}

/** Initializes, validates, sets defaults, and consolidates program options. */
async function initOptions(runOptions: RunOptions, { cli }: { cli?: boolean } = {}): Promise<Options> {
  const { default: chalkDefault, Chalk } = await import('chalk')
  const chalk = runOptions.color ? new Chalk({ level: 1 }) : chalkDefault

  // if not executed on the command-line (i.e. executed as a node module), set the defaults
  if (!cli) {
    // set cli defaults since they are not set by commander in this case
    const cliDefaults = cliOptions.reduce(
      (acc, curr) => ({
        ...acc,
        ...(curr.default != null ? { [curr.long]: curr.default } : null),
      }),
      {},
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
  }

  // consolidate loglevel
  const loglevel = options.silent ? 'silent' : options.verbose ? 'verbose' : options.loglevel

  const json = Object.keys(options)
    .filter(option => option.startsWith('json'))
    .some(propertyOf(options))

  if (!json && loglevel !== 'silent' && options.rcConfigPath && !options.doctor) {
    print(options, `Using config file ${options.rcConfigPath}`)
  }

  // warn about deprecated options
  const deprecatedOptions = cliOptions.filter(({ long, deprecated }) => deprecated && options[long as keyof Options])
  if (deprecatedOptions.length > 0) {
    deprecatedOptions.forEach(({ long, description }) => {
      const deprecationMessage = `--${long}: ${description}`
      print(options, chalk.yellow(deprecationMessage), 'warn')
    })
    print(options, '', 'warn')
  }

  // validate options with predefined choices
  cliOptions.forEach(({ long, choices }) => {
    if (!choices || choices.length === 0) return
    const value = options[long as keyof Options]
    const values = ([] as typeof value[]).concat(value)
    if (values.length === 0) return
    // make sure the option value is valid
    // if an array of values is given, make sure each one is a valid choice
    if (values.every(value => !choices.includes(value))) {
      programError(
        options,
        chalk.red(`Invalid option value: --${long} ${value}. Valid values are: ${choices.join(', ')}.`),
      )
    }
  })

  // validate options.cwd
  if (options.cwd && !(await exists(options.cwd))) {
    programError(options, `no such directory: ${options.cwd}`)
  }

  // trim filter args
  // disallow non-matching filter and args
  const args = parseFilterExpression(options.args)
  const filter = parseFilterExpression(options.filter)
  // convert to string for comparison purposes
  // otherwise ['a b'] will not match ['a', 'b']
  if (options.filter && args && !isEqual(args.join(' '), Array.isArray(filter) ? filter.join(' ') : filter)) {
    programError(
      options,
      chalk.red('Cannot specify a filter using both --filter and args. Did you forget to quote an argument?') +
        '\nSee: https://github.com/raineorshine/npm-check-updates/issues/759#issuecomment-723587297',
    )
  }
  // disallow packageFile and --deep
  else if (options.packageFile && options.deep) {
    programError(
      options,
      chalk.red(`Cannot specify both --packageFile and --deep. --deep is an alias for --packageFile '**/package.json'`),
    )
  }

  // disallow --workspace and --workspaces
  else if (options.workspace?.length && options.workspaces) {
    programError(options, chalk.red('Cannot specify both --workspace and --workspaces.'))
  }

  // disallow --workspace(s) and --deep
  else if (options.deep && (options.workspace?.length || options.workspaces)) {
    programError(options, chalk.red(`Cannot specify both --deep and --workspace${options.workspaces ? 's' : ''}.`))
  }

  // disallow incorrect or missing registry path when selecting staticRegistry as packageManager
  if (options.packageManager === 'staticRegistry') {
    if (options.registry === undefined || options.registry === null) {
      programError(
        options,
        chalk.red(
          'When --package-manager staticRegistry is specified, you must provide the path for the registry file with --registry. Run "ncu --help --packageManager" for details.',
        ),
      )
    }
    if (!(await exists(options.registry!))) {
      programError(options, chalk.red(`The specified static registry file does not exist: ${options.registry}`))
    }
  }
  const target: Target = options.target || 'latest'

  const autoPre = target === 'newest' || target === 'greatest'

  const packageManager = await determinePackageManager(options)

  const resolvedOptions: Options = {
    ...options,
    ...(options.deep
      ? { packageFile: '**/package.json' }
      : packageManager === 'deno' && !options.packageFile
      ? { packageFile: 'deno.json' }
      : null),
    ...(packageManager === 'deno' && options.dep !== cliOptionsMap.dep.default ? { dep: ['imports'] } : null),
    ...(options.format && options.format.length > 0 ? { format: options.format } : null),
    filter: args || filter,
    // add shortcut for any keys that start with 'json'
    json,
    loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to false, except when newest or greatest are set
    // this is overriden on a per-dependency basis in queryVersions to allow prereleases to be upgraded to newer prereleases
    ...(options.pre != null || autoPre ? { pre: options.pre != null ? !!options.pre : autoPre } : null),
    target,
    // imply upgrade in interactive mode when json is not specified as the output
    ...(options.interactive && options.upgrade === undefined ? { upgrade: !json } : null),
    packageManager,
  }
  resolvedOptions.cacher = await cacher(resolvedOptions)

  // print 'Using yarn/pnpm/etc' when autodetected
  // use resolved options so that options.json is set
  if (!options.packageManager && packageManager !== 'npm') {
    print(resolvedOptions, `Using ${packageManager}`)
  }

  return resolvedOptions
}

export default initOptions
