import { print, sanitizeForDisplay } from '../lib/logging.ts'
import { type Options } from '../types/Options.ts'
import style from './style.ts'

/** Print an error. Exit the process if in CLI mode. */
function programError(
  options: Options,
  message: string,
  {
    color = true,
  }: {
    // defaults to true, which uses style.red on the whole error message.
    // set to false to provide your own coloring.
    color?: boolean
  } = {},
): never {
  // callers pass registry and package manager text through here, so strip it before styleText adds its own escapes.
  // String() because some callers pass an Error despite the signature.
  const safe = sanitizeForDisplay(String(message))
  if (options.cli) {
    print(options, color ? style.red(safe) : safe, null, 'error')
    process.exit(1)
  } else {
    throw new Error(safe)
  }
}

export default programError
