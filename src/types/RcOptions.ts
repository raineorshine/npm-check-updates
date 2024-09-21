import { RunOptions } from './RunOptions'

/** Options that would make no sense in a .ncurc file */
type Nonsensical = 'configFileName' | 'configFilePath' | 'cwd' | 'packageData' | 'stdin'

/** Expected options that might be found in an .ncurc file. Since the config is external, this cannot be guaranteed */
export type RcOptions = Omit<RunOptions, Nonsensical> & {
  $schema?: string
  format?: string | string[] // Format is often set as a string, but needs to be an array
}
