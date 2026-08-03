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
import { type SpawnResult } from '../types/SpawnResult.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
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
  return typeof value === 'number' && !isNaN(value) && value >= 0 ? value : undefined
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

/** Reads and parses a pnpm config file, or null if it does not exist or cannot be parsed. */
const readPnpmConfig = async (filePath: string, format: 'yaml' | 'ini'): Promise<Record<string, unknown> | null> => {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  try {
    return (format === 'yaml' ? parseYaml(content) : ini.parse(content)) ?? {}
  } catch {
    return null
  }
}

/** Reads and parses a config file, returning its minimumReleaseAge settings, or null if unavailable. */
const readMinimumReleaseAgeLayer = async (
  filePath: string,
  format: 'yaml' | 'ini',
): Promise<MinimumReleaseAgeLayer | null> => {
  const parsed = await readPnpmConfig(filePath, format)
  return parsed ? parseMinimumReleaseAgeLayer(parsed) : null
}

/** Returns true if a path exists. */
const pathExists = async (path: string): Promise<boolean> =>
  fs
    .access(path)
    .then(() => true)
    .catch(() => false)

/**
 * Reads minimumReleaseAge settings from pnpm's config, falling back through pnpm's config layers.
 *
 * pnpm-workspace.yaml takes precedence over pnpm's global config for minimumReleaseAge.
 * By default, prefers global config.yaml if present, otherwise falls back to global rc.
 * minimumReleaseAgeExclude patterns are merged across all considered layers. Returns null if no
 * layer defines a minimumReleaseAge.
 *
 * @param pnpmMajorVersion Optional override for deterministic tests and compatibility.
 * undefined prefers config.yaml if present, otherwise rc. null reads both globals.
 * A number uses pnpm version-aware selection (config.yaml for >= 11, rc for <= 10).
 */
const getPnpmWorkspaceMinimumReleaseAge = async (
  pnpmMajorVersion?: number | null,
): Promise<PnpmWorkspaceMinimumReleaseAge | null> => {
  const globalConfigDir = getPnpmGlobalConfigDir()
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml')
  const globalConfigYamlPath = path.join(globalConfigDir, 'config.yaml')
  const globalRcPath = path.join(globalConfigDir, 'rc')

  const globalLayers =
    pnpmMajorVersion === undefined
      ? (await pathExists(globalConfigYamlPath))
        ? [await readMinimumReleaseAgeLayer(globalConfigYamlPath, 'yaml')]
        : [await readMinimumReleaseAgeLayer(globalRcPath, 'ini')]
      : await Promise.all([
          pnpmMajorVersion == null || pnpmMajorVersion >= 11
            ? readMinimumReleaseAgeLayer(globalConfigYamlPath, 'yaml')
            : null,
          pnpmMajorVersion == null || pnpmMajorVersion <= 10 ? readMinimumReleaseAgeLayer(globalRcPath, 'ini') : null,
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

/** Shape of the pnpm-workspace.yaml registries setting. */
interface PnpmWorkspaceRegistries {
  /** Registry used for packages that do not match a scoped entry. */
  default?: string
  /** Registries keyed by package scope, e.g. `{ '@myorg': 'https://registry.example.com/' }`. */
  scoped: Index<string>
}

/** Extracts registries settings from an already-parsed config object. */
const parseRegistriesLayer = (parsed: Record<string, unknown>): PnpmWorkspaceRegistries => {
  const registries = parsed.registries
  if (typeof registries !== 'object' || registries === null || Array.isArray(registries)) return { scoped: {} }

  const { default: defaultRegistry, ...scoped } = keyValueBy(registries as Index<unknown>, (scope, registry) =>
    typeof registry === 'string' && registry.trim() !== '' ? { [scope]: registry } : null,
  )

  return { default: defaultRegistry, scoped }
}

/**
 * Reads registries settings from pnpm's config, falling back through pnpm's config layers.
 *
 * pnpm-workspace.yaml takes precedence over pnpm's global config for the default registry, and per scope
 * for the scoped registries. registries requires pnpm >= 11, so the pnpm <= 10 rc file is not consulted.
 */
const getPnpmWorkspaceRegistries = async (cwd?: string): Promise<PnpmWorkspaceRegistries> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml', { cwd })

  const [workspaceConfig, globalConfig] = await Promise.all([
    pnpmWorkspacePath ? readPnpmConfig(pnpmWorkspacePath, 'yaml') : null,
    readPnpmConfig(path.join(getPnpmGlobalConfigDir(), 'config.yaml'), 'yaml'),
  ])

  const workspace = parseRegistriesLayer(workspaceConfig ?? {})
  const global = parseRegistriesLayer(globalConfig ?? {})

  return {
    default: workspace.default ?? global.default,
    scoped: { ...global.scoped, ...workspace.scoped },
  }
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
  const { stdout, stderr, command } = await spawnCommand('pnpm', args).catch((err: unknown) => {
    // spawn-please rejects with stderr as a bare string on a non-zero exit code, which loses err.message downstream
    if (err instanceof Error) {
      throw err
    }

    throw new Error(`Error executing "pnpm ${args.join(' ')}". ${String(err).trim() || 'No error output.'}`)
  })

  return parseList(stdout, command, stderr)
}

// Read the npmrc next to pnpm-workspace.yaml, plus pnpm's own registries setting, and convert them to npm config variables.
// Defined as a memoized function to read the config files only once, and only if pnpm is being used.
const npmConfigFromPnpmWorkspace = memoize(async (options: Options): Promise<NpmConfig> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml', { cwd: options.cwd })
  const pnpmWorkspaceDir = pnpmWorkspacePath ? path.dirname(pnpmWorkspacePath) : undefined
  const pnpmWorkspaceConfigPath = pnpmWorkspaceDir ? path.join(pnpmWorkspaceDir, '.npmrc') : undefined

  let pnpmWorkspaceConfig = ''
  if (pnpmWorkspaceConfigPath) {
    try {
      pnpmWorkspaceConfig = await fs.readFile(pnpmWorkspaceConfigPath, 'utf-8')
      print(options, `\nUsing pnpm workspace config at ${pnpmWorkspaceConfigPath}:`, 'verbose')
    } catch (e) {}
  }

  // pnpm's registries take precedence over the .npmrc that sits next to pnpm-workspace.yaml
  const { default: defaultRegistry, scoped } = await getPnpmWorkspaceRegistries(options.cwd)

  const config: NpmConfig = {
    ...npm.normalizeNpmConfig(ini.parse(pnpmWorkspaceConfig), pnpmWorkspaceDir),
    ...keyValueBy(scoped, (scope, registry) => ({ [`${scope}:registry`]: registry })),
    ...(defaultRegistry ? { registry: defaultRegistry } : null),
  }

  print(options, config, 'verbose')

  return config
})

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
  spawnPleaseOptions?: SpawnPleaseOptions,
  spawnOptions?: SpawnOptions,
): Promise<SpawnResult> {
  const fullArgs = [
    ...(npmOptions.global ? 'global' : []),
    ...(Array.isArray(args) ? args : [args]),
    ...(npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : []),
  ]

  return spawnCommand('pnpm', fullArgs, spawnPleaseOptions, spawnOptions)
}

export { defaultPrefix, getDistTags, getPeerDependencies } from './npm.ts'

/**
 * Fetches the engines list from the registry for a specific package version.
 *
 * @param packageName
 * @param version
 * @returns Promised engines collection
 */
export const getEngines = async (
  packageName: string,
  version: Version,
  options: Options = {},
): Promise<Index<VersionSpec | undefined>> =>
  npm.getEngines(packageName, version, options, await npmConfigFromPnpmWorkspace(options))

/**
 * Check if package author changed between current and upgraded version.
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
): Promise<boolean> =>
  npm.packageAuthorChanged(
    packageName,
    currentVersion,
    upgradedVersion,
    options,
    await npmConfigFromPnpmWorkspace(options),
  )

export default spawnPnpm

export const pnpmApi = {
  getPnpmWorkspaceMinimumReleaseAge,
  getPnpmWorkspaceRegistries,
  parseList,
}
