import memoize from 'fast-memoize'
import fs from 'fs/promises'
import yaml from 'js-yaml'
import jsonMultiParse from 'json-multi-parse'
import jsonlines from 'jsonlines'
import curry from 'lodash/curry'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import exists from '../lib/exists'
import findLockfile from '../lib/findLockfile'
import { keyValueBy } from '../lib/keyValueBy'
import { print } from '../lib/logging'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { NpmConfig } from '../types/NpmConfig'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { SpawnOptions } from '../types/SpawnOptions'
import { SpawnPleaseOptions } from '../types/SpawnPleaseOptions'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import * as npm from './npm'

interface ParsedDep {
  version: string
  from: string
  required?: {
    version: string
  }
}

export interface NpmScope {
  npmAlwaysAuth?: boolean
  npmAuthToken?: string
  npmRegistryServer?: string
}

interface YarnConfig {
  npmScopes?: Index<NpmScope>
}

/** Safely interpolates a string as a template string. */
const interpolate = (s: string, data: Index<string | undefined>): string =>
  s.replace(
    /\$\{([^:-]+)(?:(:)?-([^}]*))?\}/g,
    (match, key, name, fallbackOnEmpty, fallback) => data[key] || (fallbackOnEmpty ? fallback : ''),
  )

/** Reads an auth token from a yarn config, interpolates it, and returns it as an npm config key-value pair. */
export const npmAuthTokenKeyValue = curry((npmConfig: Index<string | boolean>, dep: string, scopedConfig: NpmScope) => {
  if (scopedConfig.npmAuthToken) {
    // get registry server from this config or a previous config (assumes setNpmRegistry has already been called on all npm scopes)
    const registryServer = scopedConfig.npmRegistryServer || (npmConfig[`@${dep}:registry`] as string | undefined)
    // interpolate environment variable fallback
    // https://yarnpkg.com/configuration/yarnrc
    if (registryServer) {
      let trimmedRegistryServer = registryServer.replace(/^https?:/, '')

      if (trimmedRegistryServer.endsWith('/')) {
        trimmedRegistryServer = trimmedRegistryServer.slice(0, -1)
      }

      return {
        [`${trimmedRegistryServer}/:_authToken`]: interpolate(scopedConfig.npmAuthToken, process.env),
      }
    }
  }

  return null
})

/** Reads a registry from a yarn config. interpolates it, and returns it as an npm config key-value pair. */
const npmRegistryKeyValue = (dep: string, scopedConfig: NpmScope): null | Index<VersionSpec> =>
  scopedConfig.npmRegistryServer
    ? { [`@${dep}:registry`]: interpolate(scopedConfig.npmRegistryServer, process.env) }
    : null

/**
 * Returns the path to the local .yarnrc.yml, or undefined. This doesn't
 * actually check that the .yarnrc.yml file exists.
 *
 * Exported for test purposes only.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 */
export async function getPathToLookForYarnrc(
  options: Options,
  readdir: (_path: string) => Promise<string[]> = fs.readdir,
): Promise<string | undefined> {
  if (options.global) return undefined

  const directoryPath = (await findLockfile(options, readdir))?.directoryPath
  if (!directoryPath) return undefined

  return path.join(directoryPath, '.yarnrc.yml')
}

// If private registry auth is specified in npmScopes in .yarnrc.yml, read them in and convert them to npm config variables.
// Define as a memoized function to efficiently call existsSync and readFileSync only once, and only if yarn is being used.
// https://github.com/raineorshine/npm-check-updates/issues/1036
const npmConfigFromYarn = memoize(async (options: Options): Promise<NpmConfig> => {
  const yarnrcLocalPath = await getPathToLookForYarnrc(options)
  const yarnrcUserPath = path.join(os.homedir(), '.yarnrc.yml')
  const yarnrcLocalExists = typeof yarnrcLocalPath === 'string' && (await exists(yarnrcLocalPath))
  const yarnrcUserExists = await exists(yarnrcUserPath)
  const yarnrcLocal = yarnrcLocalExists ? await fs.readFile(yarnrcLocalPath, 'utf-8') : ''
  const yarnrcUser = yarnrcUserExists ? await fs.readFile(yarnrcUserPath, 'utf-8') : ''
  const yarnConfigLocal: YarnConfig = yaml.load(yarnrcLocal) as YarnConfig
  const yarnConfigUser: YarnConfig = yaml.load(yarnrcUser) as YarnConfig

  let npmConfig: Index<string | boolean> = {
    ...keyValueBy(yarnConfigUser?.npmScopes || {}, npmRegistryKeyValue),
    ...keyValueBy(yarnConfigLocal?.npmScopes || {}, npmRegistryKeyValue),
  }

  // npmAuthTokenKeyValue uses scoped npmRegistryServer, so must come after npmRegistryKeyValue
  npmConfig = {
    ...npmConfig,
    ...keyValueBy(yarnConfigUser?.npmScopes || {}, npmAuthTokenKeyValue(npmConfig)),
    ...keyValueBy(yarnConfigLocal?.npmScopes || {}, npmAuthTokenKeyValue(npmConfig)),
  }

  // set auth token after npm registry, since auth token syntax uses regitry

  if (yarnrcLocalExists) {
    print(options, `\nUsing local yarn config at ${yarnrcLocalPath}:`, 'verbose')
    print(options, yarnConfigLocal, 'verbose')
  }
  if (yarnrcUserExists) {
    print(options, `\nUsing user yarn config at ${yarnrcUserPath}:`, 'verbose')
    print(options, yarnConfigLocal, 'verbose')
  }

  if (Object.keys(npmConfig)) {
    print(options, '\nMerged yarn config in npm format:', 'verbose')
    print(options, npmConfig, 'verbose')
  }

  return npmConfig
})

/**
 * Parse JSON lines and throw an informative error on failure.
 *
 * Note: although this is similar to the NPM parseJson() function we always return the
 * same concrete-type here, for now.
 *
 * @param result    Output from `yarn list --json` to be parsed
 */
function parseJsonLines(result: string): Promise<{ dependencies: Index<ParsedDep> }> {
  return new Promise((resolve, reject) => {
    const dependencies: Index<ParsedDep> = {}

    const parser = jsonlines.parse()

    parser.on('data', d => {
      // only parse info data
      // ignore error info, e.g. "Visit https://yarnpkg.com/en/docs/cli/list for documentation about this command."
      if (d.type === 'info' && !d.data.match(/^Visit/)) {
        // parse package name and version number from info data, e.g. "nodemon@2.0.4" has binaries
        const [, pkgName, pkgVersion] = d.data.match(/"(@?.*)@(.*)"/) || []

        dependencies[pkgName] = {
          version: pkgVersion,
          from: pkgName,
        }
      } else if (d.type === 'error') {
        reject(new Error(d.data))
      }
    })

    parser.on('end', () => {
      resolve({ dependencies })
    })

    parser.on('error', reject)

    parser.write(result)

    parser.end()
  })
}

const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

/**
 * Spawn yarn requires a different command on Windows.
 *
 * @param args
 * @param [yarnOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
async function spawnYarn(
  args: string | string[],
  yarnOptions: NpmOptions = {},
  spawnPleaseOptions: SpawnPleaseOptions = {},
  spawnOptions: SpawnOptions = {},
): Promise<string> {
  const fullArgs = [
    ...(yarnOptions.global ? ['global'] : []),
    ...(yarnOptions.prefix ? [`--prefix=${yarnOptions.prefix}`] : []),
    '--depth=0',
    '--json',
    '--no-progress',
    // args must go after yarn options, otherwise they are passed through to npm scripts
    // https://github.com/raineorshine/npm-check-updates/issues/1362
    ...(Array.isArray(args) ? args : [args]),
  ]

  const { stdout } = await spawn(cmd, fullArgs, spawnPleaseOptions, spawnOptions)

  return stdout
}

/**
 * Get platform-specific default prefix to pass on to yarn.
 *
 * @param options
 * @param [options.global]
 * @param [options.prefix]
 * @returns
 */
export async function defaultPrefix(options: Options): Promise<string | null> {
  if (options.prefix) {
    return Promise.resolve(options.prefix)
  }

  const { stdout: prefix } = await spawn(cmd, ['global', 'dir'])
    // yarn 2.0 does not support yarn global
    // catch error to prevent process from crashing
    // https://github.com/raineorshine/npm-check-updates/issues/873
    .catch(() => ({
      stdout: null,
    }))

  // FIX: for ncu -g doesn't work on homebrew or windows #146
  // https://github.com/raineorshine/npm-check-updates/issues/146

  return options.global && prefix && prefix.match('Cellar')
    ? '/usr/local'
    : // Workaround: get prefix on windows for global packages
      // Only needed when using npm api directly
      process.platform === 'win32' && options.global && !process.env.prefix
      ? prefix
        ? prefix.trim()
        : `${process.env.LOCALAPPDATA}\\Yarn\\Data\\global`
      : null
}

/**
 * Fetches the list of all installed packages.
 *
 * @param [options]
 * @param [options.cwd]
 * @param [options.global]
 * @param [options.prefix]
 * @returns
 */
export const list = async (options: Options = {}, spawnOptions?: SpawnOptions): Promise<Index<string | undefined>> => {
  const jsonLines: string = await spawnYarn(
    'list',
    options as Index<string>,
    {},
    {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...spawnOptions,
    },
  )
  const json: { dependencies: Index<ParsedDep> } = await parseJsonLines(jsonLines)
  const keyValues: Index<string | undefined> = keyValueBy<ParsedDep, string | undefined>(
    json.dependencies,
    (name, info): { [key: string]: string | undefined } => ({
      // unmet peer dependencies have a different structure
      [name]: info.version || info.required?.version,
    }),
  )
  return keyValues
}

/** Wraps a GetVersion function and passes the yarn config. */
const withNpmConfigFromYarn =
  (getVersion: GetVersion): GetVersion =>
  async (packageName, currentVersion, options = {}) =>
    getVersion(packageName, currentVersion, options, await npmConfigFromYarn(options))

export const distTag = withNpmConfigFromYarn(npm.distTag)
export const greatest = withNpmConfigFromYarn(npm.greatest)
export const latest = withNpmConfigFromYarn(npm.latest)
export const minor = withNpmConfigFromYarn(npm.minor)
export const newest = withNpmConfigFromYarn(npm.newest)
export const patch = withNpmConfigFromYarn(npm.patch)
export const semver = withNpmConfigFromYarn(npm.semver)

/**
 * Fetches the list of peer dependencies for a specific package version.
 *
 * @param packageName
 * @param version
 * @param cwd
 * @returns Promised {packageName: version} collection
 */
export const getPeerDependencies = async (
  packageName: string,
  version: Version,
  cwd: string | undefined,
): Promise<Index<Version>> => {
  const { stdout: yarnVersion } = await spawn(cmd, ['--version'], { rejectOnError: false }, { cwd })
  if (yarnVersion.startsWith('1')) {
    const args = ['--json', 'info', `${packageName}@${version}`, 'peerDependencies']
    const { stdout } = await spawn(cmd, args, { rejectOnError: false }, { cwd })
    return stdout ? npm.parseJson<{ data?: Index<Version> }>(stdout, { command: args.join(' ') }).data || {} : {}
  } else {
    const args = ['--json', 'npm', 'info', `${packageName}@${version}`, '--fields', 'peerDependencies']
    const { stdout } = await spawn(cmd, args, { rejectOnError: false }, { cwd })
    if (!stdout) {
      return {}
    }
    try {
      return (
        npm.parseJson<{ peerDependencies?: Index<Version> }>(stdout, { command: args.join(' ') }).peerDependencies || {}
      )
    } catch (parseError) {
      try {
        const firstObj = jsonMultiParse(stdout)[0]
        if (firstObj) {
          return (
            npm.parseJson<{ peerDependencies?: Index<Version> }>(JSON.stringify(firstObj), { command: args.join(' ') })
              .peerDependencies || {}
          )
        }
      } catch {}
      throw parseError
    }
  }
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
): Promise<Index<VersionSpec | undefined>> =>
  npm.getEngines(packageName, version, options, await npmConfigFromYarn(options))

/**
 * Check if package author changed between current and upgraded version.
 *
 * @param packageName Name of the package
 * @param currentVersion Current version declaration (may be range)
 * @param upgradedVersion Upgraded version declaration (may be range)
 * @param npmConfigLocal Additional npm config variables that are merged into the system npm config
 * @returns A promise that fulfills with boolean value.
 */
export const packageAuthorChanged = async (
  packageName: string,
  currentVersion: VersionSpec,
  upgradedVersion: VersionSpec,
  options: Options = {},
): Promise<boolean> =>
  npm.packageAuthorChanged(packageName, currentVersion, upgradedVersion, options, await npmConfigFromYarn(options))

export default spawnYarn
