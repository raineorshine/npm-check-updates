// eslint-disable-next-line fp/no-events
import { EventEmitter, once } from 'events'
import memoize from 'fast-memoize'
import fs from 'fs/promises'
import jsonlines from 'jsonlines'
import curry from 'lodash/curry'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import yaml from 'yaml'
import exists from '../lib/exists'
import findLockfile from '../lib/findLockfile'
import { keyValueBy } from '../lib/keyValueBy'
import { print } from '../lib/logging'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { SpawnOptions } from '../types/SpawnOptions'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import {
  distTag as npmDistTag,
  greatest as npmGreatest,
  minor as npmMinor,
  newest as npmNewest,
  patch as npmPatch,
} from './npm'

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
const interpolate = (s: string, data: any): string =>
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
const npmConfigFromYarn = memoize(async (options: Options): Promise<Index<string | boolean>> => {
  const yarnrcLocalPath = await getPathToLookForYarnrc(options)
  const yarnrcUserPath = path.join(os.homedir(), '.yarnrc.yml')
  const yarnrcLocalExists = typeof yarnrcLocalPath === 'string' && (await exists(yarnrcLocalPath))
  const yarnrcUserExists = await exists(yarnrcUserPath)
  const yarnrcLocal = yarnrcLocalExists ? await fs.readFile(yarnrcLocalPath, 'utf-8') : ''
  const yarnrcUser = yarnrcUserExists ? await fs.readFile(yarnrcUserPath, 'utf-8') : ''
  const yarnConfigLocal: YarnConfig = yaml.parse(yarnrcLocal)
  const yarnConfigUser: YarnConfig = yaml.parse(yarnrcUser)

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
 * @param result    Output from `yarn list --json` to be parsed
 */
async function parseJsonLines(result: string): Promise<{ dependencies: Index<ParsedDep> }> {
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
      throw new Error(d.data)
    }
  })

  parser.write(result)

  parser.end()

  await once(parser as unknown as EventEmitter, 'end')

  return { dependencies }
}

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
  spawnOptions?: SpawnOptions,
): Promise<string> {
  const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

  const fullArgs = [
    ...(yarnOptions.location === 'global' ? 'global' : []),
    ...(Array.isArray(args) ? args : [args]),
    '--depth=0',
    ...(yarnOptions.prefix ? `--prefix=${yarnOptions.prefix}` : []),
    '--json',
    '--no-progress',
  ]

  return spawn(cmd, fullArgs, spawnOptions)
}

/**
 * Get platform-specific default prefix to pass on to yarn.
 *
 * @param options
 * @param [options.global]
 * @param [options.prefix]
 * @returns
 */
export async function defaultPrefix(options: Options): Promise<string> {
  if (options.prefix) {
    return Promise.resolve(options.prefix)
  }

  const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

  const prefix = await spawn(cmd, ['global', 'dir'])
    // yarn 2.0 does not support yarn global
    // catch error to prevent process from crashing
    // https://github.com/raineorshine/npm-check-updates/issues/873
    .catch(() => {
      /* empty */
    })

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
  const jsonLines: string = await spawnYarn('list', options as Index<string>, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...spawnOptions,
  })
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

/**
 * Fetches the highest version number, regardless of tag or publish time.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const greatest: GetVersion = async (packageName, currentVersion, options: Options = {}) =>
  npmGreatest(packageName, currentVersion, options, await npmConfigFromYarn(options))

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const distTag: GetVersion = async (packageName, currentVersion, options: Options = {}) =>
  npmDistTag(packageName, currentVersion, options, await npmConfigFromYarn(options))

/**
 * Fetches the version published to the latest tag.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const latest: GetVersion = async (packageName: string, currentVersion: Version, options: Options = {}) =>
  distTag(packageName, currentVersion, { ...options, distTag: 'latest' })

/**
 * Fetches the most recently published version, regardless of version number.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const newest: GetVersion = async (packageName: string, currentVersion, options = {}) =>
  npmNewest(packageName, currentVersion, options, await npmConfigFromYarn(options))

/**
 * Fetches the highest version with the same major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const minor: GetVersion = async (packageName, currentVersion, options = {}) =>
  npmMinor(packageName, currentVersion, options, await npmConfigFromYarn(options))

/**
 * Fetches the highest version with the same minor and major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const patch: GetVersion = async (packageName, currentVersion, options = {}) =>
  npmPatch(packageName, currentVersion, options, await npmConfigFromYarn(options))

export default spawnYarn
