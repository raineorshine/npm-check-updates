import _ from 'lodash'
import fs from 'fs'
import Chalk from 'chalk'
import { deepPatternPrefix } from '../constants'
import programError from './programError'
import getPackageFileName from './getPackageFileName'
import { print } from '../logging'
import { Options } from '../types'

/** Initializes and consolidates program options. */
function initOptions(options: Options): Options {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  const json = Object.keys(options)
    .filter(option => option.startsWith('json'))
    .some(_.propertyOf(options))

  // disallow combination of --target, --greatest, or --newest
  if (options.target && options.greatest) {
    programError(options, chalk.red('Cannot specify both --target and --greatest. --greatest is an alias for "--target greatest".'))
  }
  else if (options.target && options.newest) {
    programError(options, chalk.red('Cannot specify both --target and --newest. --newest is an alias for "--target newest".'))
  }
  else if (options.greatest && options.newest) {
    programError(options, chalk.red('Cannot specify both --greatest and --newest. --greatest is an alias for "--target greatest" and --newest is an alias for "--target newest".'))
  }
  // disallow non-matching filter and args
  else if (options.filter && (options.args || []).length > 0 && options.filter !== options.args!.join(' ')) {
    programError(options, chalk.red('Cannot specify a filter using both --filter and args. Did you forget to quote an argument?') + '\nSee: https://github.com/raineorshine/npm-check-updates/issues/759#issuecomment-723587297')
  }
  else if (options.packageFile && options.deep) {
    programError(options, chalk.red(`Cannot specify both --packageFile and --deep. --deep is an alias for --packageFile '${deepPatternPrefix}package.json'`))
  }

  const target = options.newest ? 'newest'
    : options.greatest ? 'greatest'
    : options.target || options.semverLevel || 'latest'

  const autoPre = target === 'newest' || target === 'greatest'

  const format = [
    ...options.format || [],
    ...options.ownerChanged ? ['ownerChanged'] : []
  ]

  // autodetect yarn
  const files = fs.readdirSync(options.cwd || '.')
  const autoYarn = !options.packageManager && !options.global && files.includes('yarn.lock') && !files.includes('package-lock.json')
  if (autoYarn) {
    print(options, 'Using yarn')
  }

  return {
    ...options,
    ...options.deep ? { packageFile: `${deepPatternPrefix}${getPackageFileName(options)}` } : null,
    ...(options.args || []).length > 0 ? { filter: options.args!.join(' ') } : null,
    ...format.length > 0 ? { format } : null,
    // add shortcut for any keys that start with 'json'
    json,
    // convert silent option to loglevel silent
    loglevel: options.silent ? 'silent' : options.loglevel,
    minimal: options.minimal === undefined ? false : options.minimal,
    // default to false, except when newest or greatest are set
    ...options.pre != null || autoPre
      ? { pre: options.pre != null ? !!options.pre : autoPre }
      : null,
    ...options.packageData && typeof options.packageData !== 'string' ? { packageData: JSON.stringify(options.packageData, null, 2) } : null,
    target,
    // imply upgrade in interactive mode when json is not specified as the output
    ...options.interactive && options.upgrade === undefined ? { upgrade: !json } : null,
    ...!options.packageManager && { packageManager: autoYarn ? 'yarn' : 'npm' },
  }
}

export default initOptions
