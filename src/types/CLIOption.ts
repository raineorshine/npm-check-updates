import type ExtendedHelp from './ExtendedHelp.ts'

export interface CLIOption<T = any> {
  arg?: string
  choices?: T[]
  /** If false, the option is only usable in the ncurc file, or when using npm-check-updates as a module, not on the command line. */
  cli?: boolean
  default?: T
  deprecated?: boolean
  description: string
  help?: ExtendedHelp
  /**
   * True if parse doubles as commander's accumulator for a repeatable option, i.e. it appends to the
   * previous value rather than coercing a single one. Such a parse is not idempotent, so it is only
   * applied by commander and never to values coming from the ncurc or the module API.
   */
  accumulate?: boolean
  /**
   * Coerces the option value. Applied by commander on the CLI, and to ncurc and module values unless
   * `accumulate` is set. Must be idempotent and prepared to handle unknown input types, since the
   * user's ncurc.json may not match the schema.
   */
  parse?: (s: unknown, p?: T) => T
  long: string
  short?: string
  type: string
  /** The type used in the generated RunOptions, when it differs from the internal CLI type. */
  typePublic?: string
}

export type { CLIOption as default }
