import { flatten, map, omit } from 'lodash-es'
import os from 'os'
import path from 'path'
import { rcFile } from 'rc-config-loader'
import { cliOptionsMap } from '../cli-options.js'
import { Options } from '../types/Options.js'
import programError from './programError.js'

/** Loads the .ncurc config file. */
async function getNcuRc({
  configFileName,
  configFilePath,
  packageFile,
  global,
  options,
}: {
  configFileName?: string
  configFilePath?: string
  /** If true, does not look in package directory. */
  global?: boolean
  packageFile?: string
  options: Options
}) {
  const { default: chalkDefault, Chalk } = await import('chalk')
  const chalk = options?.color ? new Chalk({ level: 1 }) : chalkDefault

  const rawResult = rcFile('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath || (global ? os.homedir() : packageFile ? path.dirname(packageFile) : undefined),
  })

  if (configFileName && !rawResult?.filePath) {
    programError(options, `Config file ${configFileName} not found in ${configFilePath || process.cwd()}`)
  }

  const result = {
    filePath: rawResult?.filePath,
    // Prevent the cli tool from choking because of an unknown option "$schema"
    config: omit(rawResult?.config, '$schema'),
  }

  // validate arguments here to provide a better error message
  const unknownOptions = Object.keys(result?.config || {}).filter(arg => !cliOptionsMap[arg])
  if (unknownOptions.length > 0) {
    console.error(
      chalk.red(`Unknown option${unknownOptions.length === 1 ? '' : 's'} found in config file:`),
      chalk.gray(unknownOptions.join(', ')),
    )
    console.info('Using config file ' + result!.filePath)
    console.info(`You can change the config file path with ${chalk.blue('--configFilePath')}`)
  }

  // flatten config object into command line arguments to be read by commander
  const args = result
    ? flatten(
        map(result.config, (value, name) =>
          // if a boolean option is true, include only the nullary option --${name}
          // an option is considered boolean if its type is explicitly set to boolean, or if it is has a proper Javascript boolean value
          value === true || (cliOptionsMap[name]?.type === 'boolean' && value)
            ? [`--${name}`]
            : // if a boolean option is false, exclude it
              value === false || (cliOptionsMap[name]?.type === 'boolean' && !value)
              ? []
              : // otherwise render as a 2-tuple
                [`--${name}`, value],
        ),
      )
    : []

  return result ? { ...result, args } : null
}

export default getNcuRc
