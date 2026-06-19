import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import memoize from 'fast-memoize'
import { findUp } from 'find-up'
import ini from 'ini'
import { parse as parseYaml } from 'yaml'
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
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
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

/**
 * Reads minimumReleaseAge settings from pnpm's config, falling back through pnpm's config layers.
 *
 * pnpm-workspace.yaml takes precedence over pnpm's global config (config.yaml for pnpm >= 11, rc for
 * pnpm <= 10) for the minimumReleaseAge value. minimumReleaseAgeExclude patterns are merged across all
 * layers, matching pnpm's config resolution. Returns null if no layer defines a minimumReleaseAge.
 */
const getPnpmWorkspaceMinimumReleaseAge = async (): Promise<PnpmWorkspaceMinimumReleaseAge | null> => {
  const globalConfigDir = getPnpmGlobalConfigDir()

  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml')

  // Ordered from highest to lowest precedence. Each entry resolves to a config layer (or null if absent).
  const layers = await Promise.all([
    // workspace / project config
    pnpmWorkspacePath ? readMinimumReleaseAgeLayer(pnpmWorkspacePath, 'yaml') : Promise.resolve(null),
    // pnpm >= 11 global config
    readMinimumReleaseAgeLayer(path.join(globalConfigDir, 'config.yaml'), 'yaml'),
    // pnpm <= 10 global config
    readMinimumReleaseAgeLayer(path.join(globalConfigDir, 'rc'), 'ini'),
  ])

  // Use the minimumReleaseAge from the highest-precedence layer that defines it.
  const minimumReleaseAge = layers.find(layer => layer?.minimumReleaseAge != null)?.minimumReleaseAge
  if (minimumReleaseAge == null) return null

  // Merge minimumReleaseAgeExclude patterns across all layers, de-duplicating while preserving order.
  const minimumReleaseAgeExclude = [...new Set(layers.flatMap(layer => layer?.minimumReleaseAgeExclude ?? []))]

  return { minimumReleaseAge, minimumReleaseAgeExclude }
}

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls for completeness
  // this should never happen since list is only called in runGlobal -> getInstalledPackages
  if (!options.global) return npm.list(options)

  const { stdout } = await spawnCommand('pnpm', ['ls', '-g', '--json'])
  const result = JSON.parse(stdout) as PnpmList
  const list = keyValueBy(result[0].dependencies || {}, (name, { version }) => ({
    [name]: version,
  }))
  return list
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
  spawnOptions?: SpawnOptions,
  spawnPleaseOptions?: SpawnPleaseOptions,
): Promise<string> {
  const fullArgs = [
    ...(npmOptions.global ? 'global' : ''),
    ...(Array.isArray(args) ? args : [args]),
    ...(npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : []),
  ]

  const { stdout } = await spawnCommand('pnpm', fullArgs, spawnPleaseOptions, spawnOptions)

  return stdout
}

export { defaultPrefix, getPeerDependencies, getEngines, packageAuthorChanged } from './npm.ts'

export default spawnPnpm

export const pnpmApi = {
  getPnpmWorkspaceMinimumReleaseAge,
}
