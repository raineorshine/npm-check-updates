import _ from 'lodash'
import fs from 'fs'
import Chalk from 'chalk'
import cliOptions from '../cli-options'
import programError from './programError'
import getPackageFileName from './getPackageFileName'
import { print } from '../logging'
import { Options } from '../types/Options'
import { RunOptions } from '../types/RunOptions'
import { Target } from '../types/Target'
import { determinePackageManager } from './findLockAndConfigFiles'

/** Initializes, validates, sets defaults, and consolidates program options. */
function initOptions(runOptions: RunOptions, { cli }: { cli?: boolean } = {}): Options {
  const chalk = runOptions.color ? new Chalk.Instance({ level: 1 }) : Chalk

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
      silent: runOptions.silent || runOptions.loglevel === undefined,
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

  const loglevel = options.silent ? 'silent' : options.loglevel

  const json = Object.keys(options)
    .filter(option => option.startsWith('json'))
    .some(_.propertyOf(options))

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

  // disallow non-matching filter and args
  if (options.filter && (options.args || []).length > 0 && options.filter !== options.args!.join(' ')) {
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
    if (!fs.existsSync(options.registry!)) {
      programError(options, chalk.red(`The specified static registry file does not exist: ${options.registry}`))
    }
  }
  const target: Target = options.target || 'latest'

  const autoPre = target === 'newest' || target === 'greatest'

  const format = options.format || []

  const packageManager = determinePackageManager(options)

  if (!options.packageManager && packageManager === 'yarn') {
    print(options, 'Using yarn')
  }

  return {
    ...options,
    ...(options.deep ? { packageFile: `**/${getPackageFileName(options)}` } : null),
    ...((options.args || []).length > 0 ? { filter: options.args!.join(' ') } : null),
    ...(format.length > 0 ? { format } : null),
    // add shortcut for any keys that start with 'json'
    json,
    // convert silent option to loglevel silent
    loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to false, except when newest or greatest are set
    ...(options.pre != null || autoPre ? { pre: options.pre != null ? !!options.pre : autoPre } : null),
    target,
    // imply upgrade in interactive mode when json is not specified as the output
    ...(options.interactive && options.upgrade === undefined ? { upgrade: !json } : null),
    packageManager,
  }
}

export default initOptions
