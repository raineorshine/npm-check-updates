import { Options } from 'pacote'
import spawn from 'spawn-please'
import keyValueBy from '../lib/keyValueBy'
import programError from '../lib/programError'
import { Index } from '../types/IndexType'
import { NpmOptions } from '../types/NpmOptions'
import * as npm from './npm'

/** Spawn bun. */
async function spawnBun(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnOptions: Index<any> = {},
): Promise<string> {
  // Bun not yet supported on Windows.
  // @see https://github.com/oven-sh/bun/issues/43
  if (process.platform === 'win32') {
    programError(npmOptions, 'Bun not yet supported on Windows')
  }

  args = Array.isArray(args) ? args : [args]

  const fullArgs = [
    ...args,
    ...(npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : []),
    ...(npmOptions.location === 'global' ? ['--global'] : []),
  ]

  return spawn('bun', fullArgs, spawnOptions)
}
/**
 * (Bun) Fetches the list of all installed packages.
 */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  const stdout = await spawnBun(
    ['pm', 'ls'],
    {
      ...(options.global ? { location: 'global' } : null),
      ...(options.prefix ? { prefix: options.prefix } : null),
    },
    {
      ...(options.cwd ? { cwd: options.cwd } : null),
      rejectOnError: false,
    },
  )

  // parse the output of `bun pm ls` into an object { [name]: version }.
  const lines = stdout.split('\n')
  const dependencies = keyValueBy(lines, line => {
    const match = line.match(/.* (.*?)@(.+)/)
    if (match) {
      const [, name, version] = match
      return { [name]: version }
    }
    return null
  })

  return dependencies
}

export const greatest = npm.greatest
export const latest = npm.latest
export const newest = npm.newest
export const semver = npm.semver
export const minor = npm.minor
export const patch = npm.patch

export default spawnBun
