import spawn from 'spawn-please'
import programError from '../lib/programError'
import { Index } from '../types/IndexType'
import { NpmOptions } from '../types/NpmOptions'
import { latest as npmLatest, list as npmList } from './npm'

/**
 * (Bun) Fetches the list of all installed packages.
 */
export const list = npmList

/**
 * (Bun) Fetches the latest version of a package.
 */
export const latest = npmLatest

/**
 * Spawn bun.
 *
 * @param args
 * @param [bunOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
async function spawnBun(
  args: string | string[],
  bunOptions: NpmOptions = {},
  spawnOptions: Index<any> = {},
): Promise<any> {
  // Bun not yet supported on Windows.
  // @see https://github.com/oven-sh/bun/issues/43
  if (process.platform === 'win32') {
    programError(bunOptions, 'Bun not yet supported on Windows')
  }

  const cmd = 'bun'
  args = Array.isArray(args) ? args : [args]

  const fullArgs = args.concat('--global', bunOptions.prefix ? `--prefix=${bunOptions.prefix}` : [])
  return spawn(cmd, fullArgs, spawnOptions)
}

export default spawnBun
