import { Index } from './IndexType.js'

/** Options to the spawn node built-in. */
export interface SpawnOptions {
  env?: Index<string>
  stderr?: (s: string) => void
}
