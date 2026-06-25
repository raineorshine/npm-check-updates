import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import memoize from 'fast-memoize'
import { findUp } from 'find-up'
import ini from 'ini'
import { parse as parseYaml } from 'yaml'
import isString from '../lib/isString.ts'
import keyValueBy from '../lib/keyValueBy.ts'
import { print } from '../lib/logging.ts'
import spawnCommand from '../lib/spawnCommand.ts'
import { type GetVersion } from '../types/GetVersion.ts'
import { type Index } from '../types/IndexType.ts'
import { type NpmConfig } from '../types/NpmConfig.ts'
import { type NpmOptions } from '../types/NpmOptions.ts'
import { type Options } from '../types/Options.ts'
import { type SpawnOptions } from '../types/SpawnOptions.ts'
import { type SpawnPleaseOptions } from '../types/SpawnPleaseOptions.ts'
import { type SpawnResult } from '../types/SpawnResult.ts'
import { type Version } from '../types/Version.ts'
import * as npm from './npm.ts'

// return type of pnpm ls --json
type PnpmList = {
  path: string
  private: boolean
  dependencies: Index<{
    from: string
    version: Version
    resolved: string
  }>
}[]

/** Reads the npmrc config file from the pnpm-workspace.yaml directory. */
const npmConfigFromPnpmWorkspace = memoize(async (options: Options): Promise<NpmConfig> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml')
  if (!pnpmWorkspacePath) return {}

  const pnpmWorkspaceDir = path.dirname(pnpmWorkspacePath)
  const pnpmWorkspaceConfigPath = path.join(pnpmWorkspaceDir, '.npmrc')

  let pnpmWorkspaceConfig
  try {
    pnpmWorkspaceConfig = await fs.readFile(pnpmWorkspaceConfigPath, 'utf-8')
  } catch {
    return {}
  }

  print(options, `\nUsing pnpm workspace config at ${pnpmWorkspaceConfigPath}:`, 'verbose')

  const config = npm.normalizeNpmConfig(ini.parse(pnpmWorkspaceConfig), pnpmWorkspaceDir)

  print(options, config, 'verbose')

  return config
})

/** Shape of the pnpm-workspace.yaml minimumReleaseAge settings. */
export interface PnpmWorkspaceMinimumReleaseAge {
  /** Minimum release age in minutes (pnpm's native unit). */
  minimumReleaseAge: number
  /** List of package name glob patterns excluded from the minimum release age constraint. */
  minimumReleaseAgeExclude: string[]
}

/** A single config layer's parsed minimumReleaseAge settings. minimumReleaseAge is optional since a layer may only define excludes. */
interface MinimumReleaseAgeLayer {
  minimumReleaseAge?: number
  minimumReleaseAgeExclude: string[]
}

/** Coerces an arbitrary config value into a non-negative minimumReleaseAge number (in minutes), or undefined if invalid. */
const coerceMinimumReleaseAge = (raw: unknown): number | undefined => {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 ? value : undefined
}

/**
 * Coerces an arbitrary config value into a list of minimumReleaseAgeExclude glob patterns.
 * Supports native arrays (YAML) as well as JSON-encoded array strings (e.g. `["react"]`)
 * which is how `pnpm config set` stores arrays in the ini-formatted `rc` file.
 */
const coerceMinimumReleaseAgeExclude = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter(isString)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(isString)
      } catch {
        // fall through to treat the value as a single pattern
      }
    }
    return trimmed !== '' ? [trimmed] : []
  }
  return []
}

/** Extracts minimumReleaseAge settings from an already-parsed config object. */
const parseMinimumReleaseAgeLayer = (parsed: Record<string, unknown>): MinimumReleaseAgeLayer => ({
  // pnpm exposes the setting as camelCase in YAML and as kebab-case in ini/rc files.
  minimumReleaseAge: coerceMinimumReleaseAge(parsed.minimumReleaseAge ?? parsed['minimum-release-age']),
  minimumReleaseAgeExclude: coerceMinimumReleaseAgeExclude(
    parsed.minimumReleaseAgeExclude ?? parsed['minimum-release-age-exclude'],
  ),
})

/** Resolves the directory that holds pnpm's global config files, matching pnpm's own resolution. */
const getPnpmGlobalConfigDir = (): string => {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'pnpm')
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(localAppData, 'pnpm', 'config')
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Preferences', 'pnpm')
  return path.join(os.homedir(), '.config', 'pnpm')
}

/** Reads and parses a config file, returning its minimumReleaseAge settings, or null if it does not exist or cannot be parsed. */
const readMinimumReleaseAgeLayer = async (
  filePath: string,
  format: 'yaml' | 'ini',
): Promise<MinimumReleaseAgeLayer | null> => {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  let parsed: Record<string, unknown>
  try {
    parsed = (format === 'yaml' ? parseYaml(content) : ini.parse(content)) ?? {}
  } catch {
    return null
  }

  return parseMinimumReleaseAgeLayer(parsed)
}

/** Returns true if a path exists. */
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Returns the major version of the installed pnpm, or null if it cannot be determined.
 *
 * Does not pass rejectOnError, since spawn-please emits an unhandled error event instead of
 * rejecting when it is false, which would leave this promise pending when pnpm is not installed.
 */
const getPnpmMajorVersion = async (): Promise<number | null> => {
  try {
    const { stdout } = await spawnCommand('pnpm', ['--version'])
    const major = Number.parseInt(stdout.trim(), 10)
    return Number.isNaN(major) ? null : major
  } catch {
    return null
  }
}

/**
 * Reads minimumReleaseAge settings from pnpm's config, falling back through pnpm's config layers.
 *
 * pnpm-workspace.yaml takes precedence over pnpm's global config for minimumReleaseAge. pnpm reads a
 * single global config, config.yaml for >= 11 and rc for <= 10, so only one of them is consulted.
 * minimumReleaseAgeExclude patterns are merged across all considered layers. Returns null if no
 * layer defines a minimumReleaseAge.
 *
 * @param pnpmMajorVersion Optional override, used by tests to avoid spawning pnpm.
 * undefined resolves the major version from the installed pnpm. null reads both globals.
 * A number selects config.yaml for >= 11 and rc for <= 10.
 */
const getPnpmWorkspaceMinimumReleaseAge = async (
  pnpmMajorVersion?: number | null,
): Promise<PnpmWorkspaceMinimumReleaseAge | null> => {
  const globalConfigDir = getPnpmGlobalConfigDir()
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml')
  const globalConfigYamlPath = path.join(globalConfigDir, 'config.yaml')
  const globalRcPath = path.join(globalConfigDir, 'rc')

  let major = pnpmMajorVersion
  if (major === undefined) {
    const [hasConfigYaml, hasRc] = await Promise.all([pathExists(globalConfigYamlPath), pathExists(globalRcPath)])
    // which file pnpm reads only matters when both exist, so pay for the spawn just for that case
    major = hasConfigYaml && hasRc ? await getPnpmMajorVersion() : hasConfigYaml ? 11 : 10
  }

  const globalLayers = await Promise.all([
    major == null || major >= 11 ? readMinimumReleaseAgeLayer(globalConfigYamlPath, 'yaml') : null,
    major == null || major <= 10 ? readMinimumReleaseAgeLayer(globalRcPath, 'ini') : null,
  ])

  // Ordered from highest to lowest precedence. Each entry resolves to a config layer (or null if absent).
  const layers = [
    pnpmWorkspacePath ? await readMinimumReleaseAgeLayer(pnpmWorkspacePath, 'yaml') : null,
    ...globalLayers,
  ]

  // Use the minimumReleaseAge from the highest-precedence layer that defines it.
  const minimumReleaseAge = layers.find(layer => layer?.minimumReleaseAge != null)?.minimumReleaseAge
  if (minimumReleaseAge == null) return null

  // Merge minimumReleaseAgeExclude patterns across all layers, de-duplicating while preserving order.
  const minimumReleaseAgeExclude = [...new Set(layers.flatMap(layer => layer?.minimumReleaseAgeExclude ?? []))]

  return { minimumReleaseAge, minimumReleaseAgeExclude }
}

/** Parses the output of `pnpm ls -g --json` into a { name: version } index. */
const parseList = (stdout: string, command: string, stderr?: string): Index<string | undefined> => {
  const result = npm.parseJson<PnpmList>(stdout, { command, stderr })
  // pnpm omits the project entry when there is no global root, and dependencies when nothing is installed
  return keyValueBy(result[0]?.dependencies || {}, (name, { version }) => ({
    [name]: version,
  }))
}

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls for completeness
  // this should never happen since list is only called in runGlobal -> getInstalledPackages
  if (!options.global) return npm.list(options)

  const args = ['ls', '-g', '--json']
  let result: SpawnResult
  try {
    result = await spawnCommand('pnpm', args)
  } catch (err) {
    // spawn-please rejects with stderr as a bare string on a non-zero exit code, which loses err.message downstream
    if (err instanceof Error) {
      throw err
    }

    throw new Error(`Error executing "pnpm ${args.join(' ')}". ${String(err).trim() || 'No error output.'}`, {
      cause: err,
    })
  }

  return parseList(result.stdout, result.command, result.stderr)
}

/** Wraps a GetVersion function and passes the npmrc located next to the pnpm-workspace.yaml if it exists. */
const withNpmWorkspaceConfig =
  (getVersion: GetVersion): GetVersion =>
  async (packageName, currentVersion, options = {}) =>
    getVersion(packageName, currentVersion, options, {}, await npmConfigFromPnpmWorkspace(options))

export const distTag = withNpmWorkspaceConfig(npm.distTag)
export const greatest = withNpmWorkspaceConfig(npm.greatest)
export const latest = withNpmWorkspaceConfig(npm.latest)
export const minor = withNpmWorkspaceConfig(npm.minor)
export const newest = withNpmWorkspaceConfig(npm.newest)
export const patch = withNpmWorkspaceConfig(npm.patch)
export const semver = withNpmWorkspaceConfig(npm.semver)

/** Builds the pnpm argv from the given args and npm options. */
const buildArgs = (args: string | string[], npmOptions: NpmOptions): string[] => [
  ...(npmOptions.global ? ['global'] : []),
  ...(Array.isArray(args) ? args : [args]),
  ...(npmOptions.prefix ? [`--prefix=${npmOptions.prefix}`] : []),
]

/**
 * Spawn pnpm.
 *
 * @param args
 * @param [npmOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
async function spawnPnpm(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnPleaseOptions?: SpawnPleaseOptions,
  spawnOptions?: SpawnOptions,
): Promise<SpawnResult> {
  return spawnCommand('pnpm', buildArgs(args, npmOptions), spawnPleaseOptions, spawnOptions)
}

export { defaultPrefix, getDistTags, getPeerDependencies, getEngines, packageAuthorChanged } from './npm.ts'

export default spawnPnpm

export const pnpmApi = {
  buildArgs,
  getPnpmWorkspaceMinimumReleaseAge,
  parseList,
}
