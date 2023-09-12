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
  const { default: stripAnsi } = await import('strip-ansi')

  // bun pm ls
  const stdout = await spawnBun(
    ['pm', 'ls'],
    {
      ...(options.global ? { location: 'global' } : null),
      ...(options.prefix ? { prefix: options.prefix } : null),
    },
    {
      env: {
        ...process.env,
        // Disable color to ensure the output is parsed correctly.
        // However, this may be ineffective in some environments (see stripAnsi below).
        // https://bun.sh/docs/runtime/configuration#environment-variables
        NO_COLOR: '1',
      },
      ...(options.cwd ? { cwd: options.cwd } : null),
      rejectOnError: false,
    },
  )

  // Parse the output of `bun pm ls` into an object { [name]: version }.
  // When bun is spawned in the GitHub Actions environment, it outputs ANSI color. Unfortunately, it does not respect the `NO_COLOR` envirionment variable. Therefore, we have to manually strip ansi.
  const lines = stripAnsi(stdout).split('\n')
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
