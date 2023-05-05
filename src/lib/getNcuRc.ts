import flatten from 'lodash/flatten'
import map from 'lodash/map'
import path from 'path'
import { rcFile } from 'rc-config-loader'
import { cliOptionsMap } from '../cli-options'

interface Options {
  color?: boolean
  configFileName?: string
  configFilePath?: string
  packageFile?: string
}

/**
 * Loads the .ncurc config file.
 *
 * @param [cfg]
 * @param [cfg.configFileName=.ncurc]
 * @param [cfg.configFilePath]
 * @param [cfg.packageFile]
 * @returns
 */
async function getNcuRc({ color, configFileName, configFilePath, packageFile }: Options = {}) {
  const { default: chalkDefault, Chalk } = await import('chalk')
  const chalk = color ? new Chalk({ level: 1 }) : chalkDefault

  const result = rcFile('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath || (packageFile ? path.dirname(packageFile) : undefined),
  })

  // Prevent the cli tool from choking because of an unknown argument
  delete (result?.config as any)['$schema']

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
