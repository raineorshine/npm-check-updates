import cliOptions from '../cli-options.ts'
import { type Options } from '../types/Options.ts'
import programError from './programError.ts'

/**
 * Coerces raw option values using each option's own parse function, for values that never went
 * through commander: the ncurc, a nested per-package ncurc reloaded in --deep mode, or the module API.
 * Errors are reported with errorOptions, since a bare config does not carry the cli flag.
 */
function parseOptions(options: Options, errorOptions: Options = options): Options {
  const rawCooldown = options.cooldown

  for (const option of cliOptions) {
    const { parse, accumulate } = option
    if (!parse || accumulate) continue
    const key = option.long as keyof Options
    const value = options[key]
    // defaults are already in their coerced form, and commander does not parse them either
    if (value === undefined || value === option.default) continue
    try {
      options[key] = parse(value) as never
    } catch (err: any) {
      programError(errorOptions, err.message || err)
    }
  }

  // the option's parse already normalized "7d"/"12h"/"30m" to a fractional number of days, and
  // yields NaN for a string it could not read
  if (typeof rawCooldown === 'string' && typeof options.cooldown === 'number' && isNaN(options.cooldown)) {
    programError(
      errorOptions,
      `Invalid cooldown value: "${rawCooldown}". Use a number (days) or a string like "7d", "12h", or "30m".`,
    )
  }

  return options
}

export default parseOptions
