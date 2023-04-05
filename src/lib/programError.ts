import { print } from '../lib/logging'
import { Options } from '../types/Options'
import chalk from './chalk'

/** Print an error. Exit the process if in CLI mode. */
function programError(
  options: Options,
  message: string,
  {
    color = true,
  }: {
    // defaults to true, which uses chalk.red on the whole error message.
    // set to false to provide your own coloring.
    color?: boolean
  } = {},
): never {
  if (options.cli) {
    print(options, color ? chalk.red(message) : message, null, 'error')
    process.exit(1)
  } else {
    throw new Error(message)
  }
}

export default programError
