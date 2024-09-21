import os from 'os'
import path from 'path'
import { rcFile } from 'rc-config-loader'
import { cliOptionsMap } from '../cli-options'
import { Options } from '../types/Options'
import { RcOptions } from '../types/RcOptions'
import programError from './programError'

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

  const rawResult = rcFile<RcOptions>('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath || (global ? os.homedir() : packageFile ? path.dirname(packageFile) : undefined),
  })

  // ensure a file was found if expected
  const filePath = rawResult?.filePath
  if (configFileName && !filePath) {
    programError(options, `Config file ${configFileName} not found in ${configFilePath || process.cwd()}`)
  }

  // convert the config to valid options by removing $schema and parsing format
  const { $schema: _, ...rawConfig } = rawResult?.config || {}
  const config: Options = rawConfig
  if (typeof config.format === 'string') config.format = cliOptionsMap.format.parse!(config.format)

  // validate arguments here to provide a better error message
  const unknownOptions = Object.keys(config).filter(arg => !cliOptionsMap[arg])
  if (unknownOptions.length > 0) {
    console.error(
      chalk.red(`Unknown option${unknownOptions.length === 1 ? '' : 's'} found in config file:`),
      chalk.gray(unknownOptions.join(', ')),
    )
    console.info('Using config file ' + filePath)
    console.info(`You can change the config file path with ${chalk.blue('--configFilePath')}`)
  }

  // flatten config object into command line arguments to be read by commander
  const args = Object.entries(config).flatMap(([name, value]): any[] => {
    // render boolean options as a single parameter
    // an option is considered boolean if its type is explicitly set to boolean, or if it is has a proper Javascript boolean value
    if (typeof value === 'boolean' || cliOptionsMap[name]?.type === 'boolean') {
      // if the boolean option is true, include only the nullary option --${name}, otherwise exclude it
      return value ? [`--${name}`] : []
    }
    // otherwise render as a 2-tuple with name and value
    return [`--${name}`, value]
  })

  return { filePath, args, config }
}

export default getNcuRc
