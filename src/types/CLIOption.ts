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
  /** Must be prepared to handle unknown input types since the user's ncurc.json may not match the schema. */
  parse?: (s: unknown, p?: T) => T
  long: string
  /** The long names of other options that are required for this option to work. Automatically prepended to the usage examples in the extended help and README, including transitive requirements. */
  requires?: string[]
  short?: string
  type: string
}

export type { CLIOption as default }
