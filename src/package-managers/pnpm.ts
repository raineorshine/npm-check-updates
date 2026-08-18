import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import memoize from 'fast-memoize'
import { findUp } from 'find-up'
import ini from 'ini'
import { parse as parseYaml } from 'yaml'
import interpolate from '../lib/interpolate.ts'
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

/** Shape of the pnpm-workspace.yaml minimumReleaseAge settings. */
interface PnpmWorkspaceMinimumReleaseAge {
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

/** The registries resolved from pnpm's `registries` and `registry` settings. */
interface PnpmWorkspaceRegistries {
  /** Registry used for packages that do not match a scoped entry. */
  default?: string
  /** Registries keyed by package scope, e.g. `{ '@myorg': 'https://registry.example.com/' }`. */
  scoped: Index<string>
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
 * @param options.pnpmMajorVersion Optional override, used by tests to avoid spawning pnpm.
 * undefined resolves the major version from the installed pnpm. null reads both globals.
 * A number selects config.yaml for >= 11 and rc for <= 10.
 * @param options.cwd Directory to search upwards from for pnpm-workspace.yaml. Defaults to process.cwd().
 */
const getPnpmWorkspaceMinimumReleaseAge = async (
  options: { pnpmMajorVersion?: number | null; cwd?: string } = {},
): Promise<PnpmWorkspaceMinimumReleaseAge | null> => {
  const { pnpmMajorVersion, cwd } = options
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

/** Matches an environment variable placeholder that interpolate did not resolve, e.g. `${MY_REGISTRY}`. */
const envPlaceholder = /\$\{[^}]*\}/

/**
 * Extracts the string-valued registries from an already-parsed config object, keyed by `default` or by scope.
 *
 * pnpm accepts both the `registries` map and the plain `registry` setting, which the docs describe as equivalent to
 * `registries.default`. The more specific `registries.default` wins when a single layer defines both.
 *
 * @param expandEnv Whether to expand `${VAR}` placeholders in the registry URLs. pnpm only expands them in
 * trusted locations, i.e. its global config. Since pnpm 11.5.3 a registry URL containing a placeholder in
 * pnpm-workspace.yaml is ignored instead, since that file is committed and could otherwise be used to leak
 * environment secrets to an attacker-controlled registry (GHSA-3qhv-2rgh-x77r).
 */
const parseRegistries = (parsed: Record<string, unknown> | null, expandEnv: boolean): Index<string> => {
  const registries = parsed?.registries
  const scopes: Index<unknown> =
    typeof registries === 'object' && registries !== null && !Array.isArray(registries)
      ? (registries as Index<unknown>)
      : {}

  return keyValueBy({ default: parsed?.registry, ...scopes }, (scope, registry) => {
    if (typeof registry !== 'string') return null

    const value = expandEnv ? interpolate(registry, process.env) : registry
    // an empty value, or one left over from an unexpanded or unset placeholder, would produce a bogus URL,
    // so drop the registry rather than request it
    return value.trim() === '' || envPlaceholder.test(value) ? null : { [scope]: value }
  })
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
    ...parseRegistries(globalConfig, true),
    ...parseRegistries(workspaceConfig, false),
  }

  return { default: defaultRegistry, scoped }
}

/** Reads registries settings from pnpm's config, searching upwards from cwd for pnpm-workspace.yaml.
 *
 * @param options.cwd Directory to search upwards from for pnpm-workspace.yaml. Defaults to process.cwd().
 */
const getPnpmWorkspaceRegistries = async (options: { cwd?: string } = {}): Promise<PnpmWorkspaceRegistries> =>
  resolvePnpmRegistries(await findUp('pnpm-workspace.yaml', { cwd: options.cwd }))

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

/**
 * Reads and parses the npmrc that sits next to pnpm-workspace.yaml, or null if it does not exist.
 * Memoized on the directory, like readPnpmConfig, so a workspace with many packages reads and parses it once.
 */
const readWorkspaceNpmrc = memoize(async (pnpmWorkspaceDir: string): Promise<NpmConfig | null> => {
  const pnpmWorkspaceConfigPath = path.join(pnpmWorkspaceDir, '.npmrc')
  const contents = await fs.readFile(pnpmWorkspaceConfigPath, 'utf-8').catch(() => null)
  return contents == null ? null : npm.normalizeNpmConfig(ini.parse(contents), pnpmWorkspaceDir)
})

/** Reads the npmrc that sits next to pnpm-workspace.yaml, or an empty config if it does not exist. */
const npmConfigFromWorkspaceNpmrc = async (options: Options, pnpmWorkspaceDir: string): Promise<NpmConfig> => {
  const config = await readWorkspaceNpmrc(pnpmWorkspaceDir)
  if (config == null) return {}

  print(options, `\nUsing pnpm workspace config at ${path.join(pnpmWorkspaceDir, '.npmrc')}:`, 'verbose')

  return config
}

/** pnpm's config split by the npm config layer each part belongs to, since they rank differently. */
interface PnpmNpmConfig {
  /**
   * pnpm's own registries/registry settings, merged as npmConfigLocal so they outrank the ambient npm config.
   * Otherwise the `registry=` that `npm config set registry` leaves in the user .npmrc would silently win over
   * pnpm-workspace.yaml, which is the very thing these settings are read to fix.
   */
  registries: NpmConfig
  /**
   * The npmrc next to pnpm-workspace.yaml, merged as npmConfigWorkspaceProject so the local npm config still
   * overrides it, as decided in #1285.
   */
  workspaceNpmrc: NpmConfig
}

// Read the npmrc next to pnpm-workspace.yaml, plus pnpm's own registries setting, and convert them to npm config variables.
// Defined as a memoized function to read the config files only once, and only if pnpm is being used.
const npmConfigFromPnpmWorkspace = memoize(async (options: Options): Promise<PnpmNpmConfig> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml', { cwd: options.cwd })
  const pnpmWorkspaceDir = pnpmWorkspacePath ? path.dirname(pnpmWorkspacePath) : undefined

  const [workspaceNpmrc, { default: defaultRegistry, scoped }] = await Promise.all([
    pnpmWorkspaceDir ? npmConfigFromWorkspaceNpmrc(options, pnpmWorkspaceDir) : {},
    resolvePnpmRegistries(pnpmWorkspacePath),
  ])

  const registries: NpmConfig = {
    ...keyValueBy(scoped, (scope, registry) => ({ [`${scope}:registry`]: registry })),
    ...(defaultRegistry ? { registry: defaultRegistry } : null),
  }

  // a pnpm project that configures no registries resolves to an empty config, which is not worth printing
  if (Object.keys(registries).length > 0) {
    print(options, '\npnpm registries in npm format:', 'verbose')
    print(options, registries, 'verbose')
  }

  return { registries, workspaceNpmrc }
})

/** Wraps a GetVersion function and passes pnpm's registries plus the npmrc located next to the pnpm-workspace.yaml if it exists. */
const withNpmWorkspaceConfig =
  (getVersion: GetVersion): GetVersion =>
  async (packageName, currentVersion, options = {}) => {
    const { registries, workspaceNpmrc } = await npmConfigFromPnpmWorkspace(options)
    return getVersion(packageName, currentVersion, options, registries, workspaceNpmrc)
  }

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

/**
 * Wraps an npm function whose last three parameters are options plus the two npm config layers, supplying them
 * from pnpm's config. This splits the pnpm config across the same two layers withNpmWorkspaceConfig uses, so
 * that every code path resolves the same registry. Otherwise a project resolves versions and engines from two
 * different ones.
 */
const withPnpmConfig =
  <Args extends unknown[], Result>(
    fn: (...args: [...Args, Options, NpmConfig, NpmConfig]) => Promise<Result>,
  ): ((...args: [...Args, Options?]) => Promise<Result>) =>
  async (...args) => {
    // fn.length is the count of its params up to (excluding) the first with a default value, i.e. leading args
    // before `options: Options = {}`.
    const leading = args.slice(0, fn.length) as Args
    const options = (args[fn.length] ?? {}) as Options
    const { registries, workspaceNpmrc } = await npmConfigFromPnpmWorkspace(options)
    return fn(...leading, options, registries, workspaceNpmrc)
  }

export { defaultPrefix, getPeerDependencies } from './npm.ts'
export const distTag = withNpmWorkspaceConfig(npm.distTag)
export const greatest = withNpmWorkspaceConfig(npm.greatest)
export const latest = withNpmWorkspaceConfig(npm.latest)
export const minor = withNpmWorkspaceConfig(npm.minor)
export const newest = withNpmWorkspaceConfig(npm.newest)
export const patch = withNpmWorkspaceConfig(npm.patch)
export const semver = withNpmWorkspaceConfig(npm.semver)
export const getDistTags = withPnpmConfig(npm.getDistTags)
export const getEngines = withPnpmConfig(npm.getEngines)
export const packageAuthorChanged = withPnpmConfig(npm.packageAuthorChanged)

export default spawnPnpm

export const pnpmApi = {
  buildArgs,
  getPnpmWorkspaceMinimumReleaseAge,
  getPnpmWorkspaceRegistries,
  parseList,
}
