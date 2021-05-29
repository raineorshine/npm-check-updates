import path from 'path'
import _ from 'lodash'
import { rcFile } from 'rc-config-loader'

interface Options {
  configFileName?: string,
  configFilePath?: string,
  packageFile?: string,
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
function getNcuRc({ configFileName, configFilePath, packageFile }: Options = {}) {

  const result = rcFile('ncurc', {
    configFileName: configFileName || '.ncurc',
    defaultExtension: ['.json', '.yml', '.js'],
    cwd: configFilePath ||
      (packageFile ? path.dirname(packageFile) : undefined)
  })

  // flatten config object into command line arguments to be read by commander
  const args = result ?
    _.flatten(_.map(result.config, (value, name) =>
      value === true ? [`--${name}`] : [`--${name}`, value]
    )) : []

  return result ? { ...result, args } : null
}

export default getNcuRc
