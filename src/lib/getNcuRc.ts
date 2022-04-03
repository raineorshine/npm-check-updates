import path from 'path'
import _ from 'lodash'
import { rcFile } from 'rc-config-loader'
import cliOptions, { CLIOption } from '../cli-options'
import { Index } from '../types'

interface Options {
  configFileName?: string,
  configFilePath?: string,
  packageFile?: string,
}

// put cliOptions into an object for O(1) lookups
const cliOptionMap = cliOptions.reduce((accum, option) => ({
  ...accum,
  ...option.short ? { [option.short]: option } : null,
  ...option.long ? { [option.long]: option } : null,
}), {} as Index<CLIOption>)

/**
 * Loads the .ncurc config file.
 *
 * @param [cfg]
 * @param [cfg.configFileName=.ncurc]
 * @param [cfg.configFilePath]
 * @param [cfg.packageFile]
 * @returns
 */
function getNcuRc({ configFileName, configFilePath, packageFile }: Options = {}) {

  const result = rcFile('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath ||
      (packageFile ? path.dirname(packageFile) : undefined)
  })

  // validate arguments here to provide a better error message
  const unknownOptions = Object.keys(result?.config || {}).filter(arg => !cliOptionMap[arg])
  if (unknownOptions.length > 0) {
    console.error(`Unknown option${unknownOptions.length === 1 ? '' : 's'} found in rc file:`, unknownOptions.join(', '))
  }

  // flatten config object into command line arguments to be read by commander
  const args = result ?
    _.flatten(_.map(result.config, (value, name) =>
      value === true ? [`--${name}`] : [`--${name}`, value]
    )) : []

  return result ? { ...result, args } : null
}

export default getNcuRc
