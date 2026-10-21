import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import memoize from 'fast-memoize'
import nodeSemver from 'semver'
import spawn from 'spawn-please'
import findLockfile from '../lib/findLockfile.ts'
import keyValueBy from '../lib/keyValueBy.ts'
import { print } from '../lib/logging.ts'
import spawnCommand from '../lib/spawnCommand.ts'
import { type GetVersion } from '../types/GetVersion.ts'
import { type Index } from '../types/IndexType.ts'
import { type NpmConfig } from '../types/NpmConfig.ts'
import { type NpmOptions } from '../types/NpmOptions.ts'
import { type Options } from '../types/Options.ts'
import { type SpawnPleaseOptions } from '../types/SpawnPleaseOptions.ts'
import { type SpawnResult } from '../types/SpawnResult.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import * as npm from './npm.ts'

/** Spawn bun. */
async function spawnBun(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnPleaseOptions: SpawnPleaseOptions = {},
  spawnOptions: Index<any> = {},
): Promise<SpawnResult> {
  const fullArgs = [
    ...(npmOptions.global ? ['--global'] : []),
    ...(npmOptions.prefix ? [`--prefix=${npmOptions.prefix}`] : []),
    ...(Array.isArray(args) ? args : [args]),
  ]

  return spawnCommand('bun', fullArgs, spawnPleaseOptions, spawnOptions)
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

/**
 * Runs `bun info <spec> [field] --json` and returns the parsed output.
 *
 * By default a failed lookup (e.g. unknown package/version) resolves to null. Pass rejectOnError to
 * surface the error instead, matching npm's behavior of throwing on 404.
 */
async function bunInfo<R>(
  spec: string,
  field?: string,
  options: Options = {},
  { rejectOnError = false }: { rejectOnError?: boolean } = {},
): Promise<R | null> {
  const { stdout } = await spawnBun(
    ['info', spec, ...(field ? [field] : []), '--json'],
    {},
    { rejectOnError },
    {
      ...(options.cwd ? { cwd: options.cwd } : null),
    },
  )

  try {
    const parsed = JSON.parse(stripAnsi(stdout))
    // bun --json reports a missing field/version as { error, ... } rather than empty output
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'error' in parsed) return null
    return parsed
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

/**
 * Fetches the list of peer dependencies for a specific package version.
 *
 * @param packageName
 * @param version
 * @param spawnOptions
 * @returns Promised {packageName: version} collection
 */
export const getPeerDependencies = async (
  packageName: string,
  version: Version,
  options: Options = {},
): Promise<Index<Version>> => {
  const manifest = await bunInfo<{ peerDependencies?: Index<Version> }>(`${packageName}@${version}`, undefined, {
    cwd: options.cwd,
  })
  // bunInfo resolves to null when the lookup fails, which is not the same as having no peer dependencies
  if (!manifest) throw new Error(`Could not read the manifest of ${packageName}@${version} from bun`)
  return manifest.peerDependencies || {}
}

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
): Promise<Index<VersionSpec | undefined>> => {
  const manifest = await bunInfo<{ engines?: Index<VersionSpec | undefined> }>(
    `${packageName}@${version}`,
    undefined,
    options,
    { rejectOnError: true },
  )
  return manifest?.engines || {}
}

/** A registry in bunfig.toml: a URL, or an object with the URL and its credentials. */
type BunfigRegistry = string | { url?: string; token?: string; username?: string; password?: string }

/** The settings of bunfig.toml that configure registries. */
interface Bunfig {
  install?: {
    registry?: BunfigRegistry
    scopes?: Index<BunfigRegistry>
  }
}

/** Decodes percent-encoded URL credentials, leaving a malformed escape as is, as bun does. */
const decodeLenient = (value: string): string =>
  value.replace(/(?:%[\da-f]{2})+/gi, encoded => {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  })

/** Expands a credential that is exactly $NAME, as bun does. An unset variable yields no credential. */
const expandBunfigCredential = (value: unknown, env: NodeJS.ProcessEnv): string | undefined =>
  typeof value !== 'string' || !value ? undefined : /^\$\w+$/.test(value) ? env[value.slice(1)] : value

/**
 * Converts a registry from bunfig.toml to npm config: its URL under the given key, and its credentials under the
 * URL's host and path, where npm looks for them. Follows bun: a URL that is $NAME is read from that environment
 * variable, and the token, username and password keys replace any credentials in the URL.
 */
const npmConfigFromBunfigRegistry = (key: string, registry: unknown, env: NodeJS.ProcessEnv): NpmConfig => {
  const fields =
    typeof registry === 'string' ? { url: registry } : (registry as Exclude<BunfigRegistry, string> | null) || {}
  if (typeof fields.url !== 'string') return {}

  // as in bun, a variable that is unset or a single character leaves the URL as it is, which is then invalid
  const envUrl = fields.url.startsWith('$') ? env[fields.url.slice(1).replace(/^\/+|\/+$/g, '')] : undefined
  let url: URL
  try {
    url = new URL(envUrl && envUrl.length > 1 ? envUrl : fields.url)
  } catch {
    return {}
  }

  let token: string | undefined
  let username: string | undefined
  let password: string | undefined
  if (fields.token != null || fields.username != null || fields.password != null) {
    token = expandBunfigCredential(fields.token, env)
    username = expandBunfigCredential(fields.username, env)
    password = expandBunfigCredential(fields.password, env)
    // as in bun, a username without a password sends nothing
    if (!password) username = undefined
  } else if (url.username) {
    // as in npm and bun, http://user@host/ is user with an empty password
    username = decodeLenient(url.username)
    password = decodeLenient(url.password)
  } else if (url.password) {
    // http://:token@host/
    token = decodeLenient(url.password)
  }
  url.username = ''
  url.password = ''

  const nerfDart = `//${url.host}${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}`
  return {
    [key]: url.href,
    ...(token ? { [`${nerfDart}:_authToken`]: token } : null),
    ...(username ? { [`${nerfDart}:_auth`]: Buffer.from(`${username}:${password}`).toString('base64') } : null),
  }
}

/** Returns the scopes of a bunfig.toml, named without @ since bun accepts both. */
const bunfigScopes = (bunfig: Bunfig | null): Index<BunfigRegistry> => {
  const scopes = bunfig?.install?.scopes
  return scopes && typeof scopes === 'object' && !Array.isArray(scopes)
    ? keyValueBy(scopes, (scope, registry) => ({ [scope.replace(/^@/, '')]: registry }))
    : {}
}

/**
 * Converts the registries in a parsed bunfig.toml to npm config variables.
 *
 * Exported for test purposes only.
 */
export const npmConfigFromBunfig = (bunfig: Bunfig | null, env: NodeJS.ProcessEnv = process.env): NpmConfig => {
  const registry = bunfig?.install?.registry
  return {
    ...keyValueBy(bunfigScopes(bunfig), (scope, scopeRegistry) =>
      npmConfigFromBunfigRegistry(`@${scope}:registry`, scopeRegistry, env),
    ),
    ...(registry ? npmConfigFromBunfigRegistry('registry', registry, env) : null),
  }
}

/** Reads and parses a bunfig.toml, or null if it does not exist or cannot be parsed. */
const readBunfig = async (bunfigPath: string, options: Options): Promise<Bunfig | null> => {
  let content: string
  try {
    content = await fs.readFile(bunfigPath, 'utf-8')
  } catch {
    return null
  }

  try {
    // only needed for bun, so load it on demand
    const { parse: parseToml } = await import('smol-toml')
    // bun ignores a byte order mark
    return parseToml(content.replace(/^\uFEFF/, '')) as Bunfig
  } catch (err) {
    // a TOML error quotes the lines around it, which can hold a token, so print only its first line and position
    const { line, column } = err as { line?: number; column?: number }
    const reason = String(err instanceof Error ? err.message : err).split('\n')[0]
    print(
      options,
      `\nUnable to parse ${bunfigPath}${line ? ` (line ${line}, column ${column})` : ''}: ${reason}`,
      'verbose',
    )
    return null
  }
}

/** Returns the path of bun's global bunfig.toml, which is in XDG_CONFIG_HOME if it is set to an absolute path. */
const getGlobalBunfigPath = (): string => {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
  return path.join(xdgConfigHome && path.isAbsolute(xdgConfigHome) ? xdgConfigHome : os.homedir(), '.bunfig.toml')
}

/**
 * Returns the path of the project bunfig.toml. Bun reads it from the project root, so look next to the lockfile, or
 * else in the cwd or the directory of the package file.
 */
const getProjectBunfigPath = async (options: Options): Promise<string | undefined> => {
  if (options.global) return undefined
  const directoryPath =
    (await findLockfile(options))?.directoryPath ??
    (options.cwd || (options.packageFile ? path.dirname(options.packageFile) : '.'))
  return path.join(directoryPath, 'bunfig.toml')
}

// Read the registries in the global and project bunfig.toml, and convert them to npm config variables.
// Defined as a memoized function to read the config files only once, and only if bun is being used.
// https://github.com/raineorshine/npm-check-updates/issues/1364
const npmConfigFromBun = memoize(async (options: Options): Promise<NpmConfig> => {
  const projectBunfigPath = await getProjectBunfigPath(options)
  const [globalBunfig, projectBunfig] = await Promise.all([
    readBunfig(getGlobalBunfigPath(), options),
    projectBunfigPath ? readBunfig(projectBunfigPath, options) : null,
  ])

  // as in bun, the project's registry and each of its scopes replace the global ones, credentials included
  const npmConfig = npmConfigFromBunfig({
    install: {
      registry: projectBunfig?.install?.registry ?? globalBunfig?.install?.registry,
      scopes: { ...bunfigScopes(globalBunfig), ...bunfigScopes(projectBunfig) },
    },
  })

  // print the registries, but not the credentials
  const registries = keyValueBy(npmConfig, (key, value) => (key.startsWith('//') ? null : { [key]: value }))
  if (Object.keys(registries).length > 0) {
    print(options, '\nbunfig.toml registries in npm format:', 'verbose')
    print(options, registries, 'verbose')
  }

  return npmConfig
})

/** Wraps a GetVersion function and passes the registries from bunfig.toml. */
const withNpmConfigFromBun =
  (getVersion: GetVersion): GetVersion =>
  async (packageName, currentVersion, options = {}) =>
    getVersion(packageName, currentVersion, options, await npmConfigFromBun(options))

export const distTag = withNpmConfigFromBun(npm.distTag)
export const greatest = withNpmConfigFromBun(npm.greatest)
export const latest = withNpmConfigFromBun(npm.latest)
export const minor = withNpmConfigFromBun(npm.minor)
export const newest = withNpmConfigFromBun(npm.newest)
export const patch = withNpmConfigFromBun(npm.patch)
export const semver = withNpmConfigFromBun(npm.semver)

/**
 * Fetches all dist-tags published for a package.
 *
 * @param packageName
 * @returns Promised {tag: version} collection
 */
export const getDistTags = async (packageName: string, options: Options = {}): Promise<Index<Version>> =>
  npm.getDistTags(packageName, options, await npmConfigFromBun(options))

export const usesAddCommand = true

export { spawnBun as spawn }

export default spawnBun
