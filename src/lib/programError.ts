import { print } from '../logging'
import { Options } from '../types'

/** Print an error. Exit the process if in CLI mode. */
function programError(options: Options, message: string) {
  if (options.cli) {
    print(options, message, null, 'error')
    process.exit(1)
  }
  else {
    throw new Error(message)
  }
}

export default programError
