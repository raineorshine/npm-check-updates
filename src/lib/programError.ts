import { print } from '../logging'
import { Options, PreInitOptions } from '../types'

/** Print an error. Exit the process if in CLI mode. */
function programError(options: Options | PreInitOptions, message: string) {
  if (options.cli) {
    print(options, message, null, 'error')
    process.exit(1)
  }
  else {
    throw new Error(message)
  }
}

export default programError
