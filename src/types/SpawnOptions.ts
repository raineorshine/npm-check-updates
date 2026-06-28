import { type Index } from './IndexType.ts'

/** Options to the spawn node built-in. */
export interface SpawnOptions {
  cwd?: string
  env?: Index<string>
}
