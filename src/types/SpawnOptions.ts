import { Index } from './IndexType'

/** Options to the spawn node built-in. */
export interface SpawnOptions {
  cwd?: string
  env?: Index<string>
}
