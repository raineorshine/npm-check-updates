import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import nodeSemver from 'semver'
import spawn from 'spawn-please'
import keyValueBy from '../lib/keyValueBy.ts'
import { type Index } from '../types/IndexType.ts'
import { type NpmOptions } from '../types/NpmOptions.ts'
import { type Options } from '../types/Options.ts'
import { type SpawnPleaseOptions } from '../types/SpawnPleaseOptions.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'

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
export const defaultPrefix = async (options: Options): Promise<string | undefined> =>
  options.global
    ? options.prefix || process.env.BUN_INSTALL || path.dirname((await spawn('bun', ['pm', '-g', 'bin'])).stdout)
    : undefined

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

/** Runs `bun info <spec> [field] --json` and returns the parsed output, or null on any error. */
async function bunInfo<R>(spec: string, field?: string, options: Options = {}): Promise<R | null> {
  const { stdout } = await spawnBun(
    ['info', spec, ...(field ? [field] : []), '--json'],
    {},
    { rejectOnError: false },
    {
      ...(options.cwd ? { cwd: options.cwd } : null),
    },
  )
  try {
    return JSON.parse(stripAnsi(stdout)) as R
  } catch {
    return null
  }
}

/**
 * Check if package author changed between current and upgraded version.
 *
 * Uses `bun info` so it honors bun's own registry/auth config (bunfig.toml). Returns false when the
 * publisher (`_npmUser`) is unavailable for either version, matching the npm implementation.
 *
 * @param packageName Name of the package
 * @param currentVersion Current version declaration (may be range)
 * @param upgradedVersion Upgraded version declaration (may be range)
 * @returns A promise that fulfills with boolean value.
 */
export const packageAuthorChanged = async (
  packageName: string,
  currentVersion: VersionSpec,
  upgradedVersion: VersionSpec,
  options: Options = {},
): Promise<boolean> => {
  const versions = await bunInfo<string[]>(packageName, 'versions', options)
  if (!Array.isArray(versions)) return false

  const current = nodeSemver.minSatisfying(versions, currentVersion)
  const upgraded = nodeSemver.maxSatisfying(versions, upgradedVersion)
  if (!current || !upgraded) return false

  const [currentManifest, upgradedManifest] = await Promise.all([
    bunInfo<{ _npmUser?: { name?: string } }>(`${packageName}@${current}`, undefined, options),
    bunInfo<{ _npmUser?: { name?: string } }>(`${packageName}@${upgraded}`, undefined, options),
  ])

  const currentAuthor = currentManifest?._npmUser?.name
  const upgradedAuthor = upgradedManifest?._npmUser?.name
  if (!currentAuthor || !upgradedAuthor) return false

  return currentAuthor !== upgradedAuthor
}

export { distTag, getEngines, getPeerDependencies, greatest, latest, minor, newest, patch, semver } from './npm.ts'

export default spawnBun
