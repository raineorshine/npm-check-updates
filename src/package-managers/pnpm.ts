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

/**
 * Reads and parses a pnpm config file, or null if it does not exist or cannot be parsed.
 * Memoized since the same file backs several settings, so it is read and parsed once per run, like parseNpmrc.
 */
const readPnpmConfig = memoize(
  async (filePath: string, format: 'yaml' | 'ini'): Promise<Record<string, unknown> | null> => {
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
  },
)

/** Reads and parses a config file, returning its minimumReleaseAge settings, or null if unavailable. */
const readMinimumReleaseAgeLayer = async (
  filePath: string,
  format: 'yaml' | 'ini',
): Promise<MinimumReleaseAgeLayer | null> => {
  const parsed = await readPnpmConfig(filePath, format)
  return parsed ? parseMinimumReleaseAgeLayer(parsed) : null
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
 * @param cwd Directory to search upwards from for pnpm-workspace.yaml. Defaults to process.cwd().
 */
const getPnpmWorkspaceMinimumReleaseAge = async (
  pnpmMajorVersion?: number | null,
  cwd?: string,
): Promise<PnpmWorkspaceMinimumReleaseAge | null> => {
  const globalConfigDir = getPnpmGlobalConfigDir()
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml', { cwd })
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

/** Shape of the pnpm-workspace.yaml registries setting. */
export interface PnpmWorkspaceRegistries {
  /** Registry used for packages that do not match a scoped entry. */
  default?: string
  /** Registries keyed by package scope, e.g. `{ '@myorg': 'https://registry.example.com/' }`. */
  scoped: Index<string>
}

/** Extracts the string-valued registries from an already-parsed config object, keyed by `default` or by scope. */
const parseRegistries = (parsed: Record<string, unknown> | null): Index<string> => {
  const registries = parsed?.registries
  if (typeof registries !== 'object' || registries === null || Array.isArray(registries)) return {}

  return keyValueBy(registries as Index<unknown>, (scope, registry) =>
    typeof registry === 'string' && registry.trim() !== '' ? { [scope]: registry } : null,
  )
}

/**
 * Resolves registries settings from pnpm's config layers, given an already-resolved pnpm-workspace.yaml path.
 *
 * pnpm-workspace.yaml takes precedence over pnpm's global config per key, including `default`.
 * registries requires pnpm >= 11, so the pnpm <= 10 rc file is not consulted.
 */
const resolvePnpmRegistries = async (pnpmWorkspacePath?: string): Promise<PnpmWorkspaceRegistries> => {
  const [workspaceConfig, globalConfig] = await Promise.all([
    pnpmWorkspacePath ? readPnpmConfig(pnpmWorkspacePath, 'yaml') : null,
    readPnpmConfig(path.join(getPnpmGlobalConfigDir(), 'config.yaml'), 'yaml'),
  ])

  const { default: defaultRegistry, ...scoped } = {
    ...parseRegistries(globalConfig),
    ...parseRegistries(workspaceConfig),
  }

  return { default: defaultRegistry, scoped }
}

/** Reads registries settings from pnpm's config, searching upwards from cwd for pnpm-workspace.yaml. */
const getPnpmWorkspaceRegistries = async (cwd?: string): Promise<PnpmWorkspaceRegistries> =>
  resolvePnpmRegistries(await findUp('pnpm-workspace.yaml', { cwd }))

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

/** Reads the npmrc that sits next to pnpm-workspace.yaml, or an empty config if it does not exist. */
const npmConfigFromWorkspaceNpmrc = async (options: Options, pnpmWorkspaceDir: string): Promise<NpmConfig> => {
  const pnpmWorkspaceConfigPath = path.join(pnpmWorkspaceDir, '.npmrc')
  const contents = await fs.readFile(pnpmWorkspaceConfigPath, 'utf-8').catch(() => null)
  if (contents == null) return {}

  print(options, `\nUsing pnpm workspace config at ${pnpmWorkspaceConfigPath}:`, 'verbose')

  return npm.normalizeNpmConfig(ini.parse(contents), pnpmWorkspaceDir)
}

// Read the npmrc next to pnpm-workspace.yaml, plus pnpm's own registries setting, and convert them to npm config variables.
// Defined as a memoized function to read the config files only once, and only if pnpm is being used.
const npmConfigFromPnpmWorkspace = memoize(async (options: Options): Promise<NpmConfig> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml', { cwd: options.cwd })
  const pnpmWorkspaceDir = pnpmWorkspacePath ? path.dirname(pnpmWorkspacePath) : undefined

  const [npmrcConfig, { default: defaultRegistry, scoped }] = await Promise.all([
    pnpmWorkspaceDir ? npmConfigFromWorkspaceNpmrc(options, pnpmWorkspaceDir) : {},
    resolvePnpmRegistries(pnpmWorkspacePath),
  ])

  // pnpm's registries take precedence over the .npmrc that sits next to pnpm-workspace.yaml
  const config: NpmConfig = {
    ...npmrcConfig,
    ...keyValueBy(scoped, (scope, registry) => ({ [`${scope}:registry`]: registry })),
    ...(defaultRegistry ? { registry: defaultRegistry } : null),
  }

  // a pnpm project with no workspace config at all resolves to an empty config, which is not worth printing
  if (Object.keys(config).length > 0) {
    print(options, config, 'verbose')
  }

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

export { defaultPrefix, getPeerDependencies } from './npm.ts'

// The wrappers below pass the pnpm config as npmConfigWorkspaceProject, the same layer withNpmWorkspaceConfig
// uses, so that every code path resolves the same registry. Passing it as npmConfigLocal would rank it above the
// ambient npm config and make these lookups disagree with the version lookups.

/**
 * Fetches all dist-tags published for a package.
 *
 * @param packageName
 * @returns Promised {tag: version} collection
 */
export const getDistTags = async (packageName: string, options: Options = {}): Promise<Index<Version>> =>
  npm.getDistTags(packageName, options, undefined, await npmConfigFromPnpmWorkspace(options))

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
  npm.getEngines(packageName, version, options, undefined, await npmConfigFromPnpmWorkspace(options))

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
    undefined,
    await npmConfigFromPnpmWorkspace(options),
  )

export default spawnPnpm

export const pnpmApi = {
  buildArgs,
  getPnpmWorkspaceMinimumReleaseAge,
  getPnpmWorkspaceRegistries,
  parseList,
}
