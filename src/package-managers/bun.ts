import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import keyValueBy from '../lib/utils/keyValueBy.ts'
import { type Index } from '../types/IndexType.ts'
import { type NpmOptions } from '../types/NpmOptions.ts'
import { type Options } from '../types/Options.ts'
import { type SpawnPleaseOptions } from '../types/SpawnPleaseOptions.ts'

/** Spawn bun. */
async function spawnBun(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnPleaseOptions: SpawnPleaseOptions = {},
  spawnOptions: Index<any> = {},
): Promise<{ stdout: string; stderr: string }> {
  const fullArgs = [
    ...(npmOptions.global ? ['--global'] : []),
    ...(npmOptions.prefix ? [`--prefix=${npmOptions.prefix}`] : []),
    ...(Array.isArray(args) ? args : [args]),
  ]

  return spawn('bun', fullArgs, spawnPleaseOptions, spawnOptions)
}

/** Returns the global directory of bun. */
export const defaultPrefix = async (options: Options): Promise<string | undefined> => {
  if (!options.global) return undefined
  if (options.prefix || process.env.BUN_INSTALL) return options.prefix || process.env.BUN_INSTALL
  const binResult = await spawn('bun', ['pm', '-g', 'bin'])
  return path.dirname(binResult.stdout)
}

/**
 * (Bun) Fetches the list of all installed packages.
 */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // bun pm ls
  const { stdout } = await spawnBun(
    ['pm', 'ls'],
    {
      ...(options.global ? { global: true } : null),
      ...(options.prefix ? { prefix: options.prefix } : null),
    },
    {
      rejectOnError: false,
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
    },
  )

  // Parse the output of `bun pm ls` into an object { [name]: version }.
  // When bun is spawned in the GitHub Actions environment, it outputs ANSI color. Unfortunately, it does not respect the `NO_COLOR` environment variable. Therefore, we have to manually strip ansi.
  const lines = stripAnsi(stdout).split('\n')
  const dependencies = keyValueBy(lines, line => {
    // The capturing group for the package name requires a + quantifier; otherwise, namespaced packages like @angular/cli will not be captured correctly.
    const match = line.match(/.* (.+?)@(.+)/)
    if (match) {
      const [, name, version] = match
      return { [name]: version }
    }
    return null
  })

  return dependencies
}

export {
  distTag,
  getEngines,
  getPeerDependencies,
  greatest,
  latest,
  minor,
  newest,
  packageAuthorChanged,
  patch,
  semver,
} from './npm.ts'

export default spawnBun
