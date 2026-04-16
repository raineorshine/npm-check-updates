import { cosmiconfig } from 'cosmiconfig'
import os from 'os'
import path from 'path'
import { cliOptionsMap } from '../cli-options'
import { type Options } from '../types/Options'
import { type RcOptions } from '../types/RcOptions'
import { getChalk } from './chalk'
import programError from './programError'

/**
 * Detects module system mismatches and returns a helpful error message.
 * Returns null if it's not a known module mismatch (generic error).
 */
function getModuleMismatchError(errorMessage: string, filename: string): string | null {
  const basename = path.basename(filename)

  // Detect CommonJS syntax in ESM project (type: "module")
  const isCjsInEsm =
    errorMessage.includes('__filename is not defined') ||
    errorMessage.includes('__dirname is not defined') ||
    errorMessage.includes('require is not defined') ||
    errorMessage.includes('module is not defined') ||
    errorMessage.includes('exports is not defined')

  // Detect ESM syntax in CommonJS project (type: "commonjs" or default)
  const isEsmInCjs =
    errorMessage.includes('Cannot use import statement outside a module') ||
    errorMessage.includes("Unexpected token 'export'") ||
    errorMessage.includes("Unexpected token 'import'") ||
    errorMessage.includes('SyntaxError: export ') ||
    (errorMessage.includes('SyntaxError') && errorMessage.includes('import'))

  // Only provide specific guidance for .js files, not .cjs/.mjs
  const isJsFile = filename.endsWith('.js') && !filename.endsWith('.cjs') && !filename.endsWith('.mjs')

  if (isCjsInEsm && isJsFile) {
    return (
      `${basename} uses CommonJS syntax (require/module.exports) but your package.json has "type": "module".\n\n` +
      `Recommended: Convert to ESM syntax:\n` +
      `  import { ... } from '...'\n` +
      `  export default { ... }\n\n` +
      `Alternative: Rename to ${basename.replace('.js', '.cjs')} to keep CommonJS syntax.`
    )
  }

  if (isEsmInCjs && isJsFile) {
    return (
      `${basename} uses ESM syntax (import/export) but your package.json has "type": "commonjs".\n\n` +
      `Recommended: Add "type": "module" to your package.json to use ESM throughout your project.\n\n` +
      `Alternative: Rename to ${basename.replace('.js', '.mjs')} to keep CommonJS in package.json.`
    )
  }

  return null
}

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
  const chalk = getChalk(options?.color)

  const explorer = cosmiconfig('ncu', {
    searchPlaces: ['.ncurc.json', '.ncurc.yaml', '.ncurc.yml', '.ncurc.mjs', '.ncurc.cjs', '.ncurc.js'],
  })

  // Determine the base directory for searching or resolving
  const cwd = configFilePath || (global ? os.homedir() : packageFile ? path.dirname(packageFile) : process.cwd())

  let rawResult: Awaited<ReturnType<typeof explorer.search>> = null
  let targetFile: string | undefined

  try {
    if (configFileName) {
      targetFile = path.isAbsolute(configFileName) ? configFileName : path.join(cwd, configFileName)
      rawResult = await explorer.load(targetFile)
    } else {
      rawResult = await explorer.search(cwd)
      targetFile = rawResult?.filepath
    }
  } catch (err: any) {
    const errorMessage = err.message || ''
    const filename = targetFile || configFileName || '.ncurc.js'

    // Handle "file not found" for explicit --configFileName
    if (configFileName && (err.code === 'ENOENT' || errorMessage.includes('no such file or directory'))) {
      programError(options, `Config file ${configFileName} not found in ${cwd}`)
    }

    // Check for module mismatches
    const moduleError = getModuleMismatchError(errorMessage, filename)
    if (moduleError) {
      programError(options, moduleError)
    }

    programError(options, `Config file error: ${errorMessage}`)
  }

  const filePath = rawResult?.filepath

  // convert the config to valid options by removing $schema and parsing format
  const { $schema: _, ...rawConfig } = rawResult?.config || {}
  const config: Options = (rawConfig as RcOptions) || {}
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
    // an option is considered boolean if its type is explicitly set to boolean, or if it is has a proper JavaScript boolean value
    if (typeof value === 'boolean' || cliOptionsMap[name]?.type === 'boolean') {
      // if the boolean option is true, include only the nullary option --${name}; otherwise, exclude it
      return value ? [`--${name}`] : []
    }
    // otherwise render as a 2-tuple with name and value
    return [`--${name}`, value]
  })

  return { filePath, args, config }
}

export default getNcuRc
