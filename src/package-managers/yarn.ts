'use strict'

// eslint-disable-next-line fp/no-events
import { once, EventEmitter } from 'events'
import _ from 'lodash'
import cint from 'cint'
import fs from 'fs'
import os from 'os'
import path from 'path'
import jsonlines from 'jsonlines'
import memoize from 'fast-memoize'
import spawn from 'spawn-please'
import yaml from 'yaml'
import * as versionUtil from '../version-util'
import { viewOne, viewManyMemoized } from './npm'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Packument } from '../types/Packument'
import { SpawnOptions } from '../types/SpawnOptions'
import { Version } from '../types/Version'
import { NpmOptions } from '../types/NpmOptions'
import { allowDeprecatedOrIsNotDeprecated, allowPreOrIsNotPre, satisfiesNodeEngine } from './filters'
import findLockfile from '../lib/findLockfile'

interface ParsedDep {
  version: string
  from: string
}

export interface NpmScope {
  npmAlwaysAuth?: boolean
  npmAuthToken?: string
  npmRegistryServer?: string
}

interface YarnConfig {
  npmScopes?: Index<NpmScope>
}

const TIME_FIELDS = ['modified', 'created']

/** Safely interpolates a string as a template string. */
const interpolate = (s: string, data: any) =>
  s.replace(
    /\$\{([^:-]+)(?:(:)?-([^}]*))?\}/g,
    (match, key, name, fallbackOnEmpty, fallback) => data[key] || (fallbackOnEmpty ? fallback : ''),
  )

/** Reads an auth token from a yarn config, interpolates it, and sets it on the npm config. */
export const setNpmAuthToken = (npmConfig: Index<string | boolean>, [dep, scopedConfig]: [string, NpmScope]) => {
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

      npmConfig[`${trimmedRegistryServer}/:_authToken`] = interpolate(scopedConfig.npmAuthToken, process.env)
    }
  }
}

/**
 * Returns the path to the local .yarnrc.yml, or undefined. This doesn't
 * actually check that the .yarnrc.yml file exists.
 *
 * Exported for test purposes only.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 */
export function getPathToLookForYarnrc(
  options: Pick<Options, 'global' | 'cwd' | 'packageFile'>,
  readdirSync: (_path: string) => string[] = fs.readdirSync,
): string | undefined {
  if (options.global) return undefined

  const directoryPath = findLockfile(options, readdirSync)?.directoryPath
  if (!directoryPath) return undefined

  return path.join(directoryPath, '.yarnrc.yml')
}

// If private registry auth is specified in npmScopes in .yarnrc.yml, read them in and convert them to npm config variables.
// Define as a memoized function to efficiently call existsSync and readFileSync only once, and only if yarn is being used.
// https://github.com/raineorshine/npm-check-updates/issues/1036
const npmConfigFromYarn = memoize(
  (options: Pick<Options, 'global' | 'cwd' | 'packageFile'>): Index<string | boolean> => {
    const yarnrcLocalPath = getPathToLookForYarnrc(options)
    const yarnrcUserPath = path.join(os.homedir(), '.yarnrc.yml')
    const yarnrcLocalExists = typeof yarnrcLocalPath === 'string' && fs.existsSync(yarnrcLocalPath)
    const yarnrcUserExists = fs.existsSync(yarnrcUserPath)
    const yarnrcLocal = yarnrcLocalExists ? fs.readFileSync(yarnrcLocalPath, 'utf-8') : ''
    const yarnrcUser = yarnrcUserExists ? fs.readFileSync(yarnrcUserPath, 'utf-8') : ''
    const yarnConfigLocal: YarnConfig = yaml.parse(yarnrcLocal)
    const yarnConfigUser: YarnConfig = yaml.parse(yarnrcUser)

    const npmConfig: Index<string | boolean> = {}

    /** Reads a registry from a yarn config. interpolates it, and sets it on the npm config. */
    const setNpmRegistry = ([dep, scopedConfig]: [string, NpmScope]) => {
      if (scopedConfig.npmRegistryServer) {
        npmConfig[`@${dep}:registry`] = scopedConfig.npmRegistryServer
      }
    }

    // set registry for all npm scopes
    Object.entries(yarnConfigUser?.npmScopes || {}).forEach(setNpmRegistry)
    Object.entries(yarnConfigLocal?.npmScopes || {}).forEach(setNpmRegistry)

    // set auth token after npm registry, since auth token syntax uses regitry
    Object.entries(yarnConfigUser?.npmScopes || {}).forEach(s => setNpmAuthToken(npmConfig, s))
    Object.entries(yarnConfigLocal?.npmScopes || {}).forEach(s => setNpmAuthToken(npmConfig, s))

    return npmConfig
  },
)

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

/** Returns a composite predicate that filters out deprecated, prerelease, and node engine incompatibilies from version objects returns by pacote.packument. */
function filterPredicate(options: Options): (o: Packument) => boolean {
  return _.overEvery([
    o => allowDeprecatedOrIsNotDeprecated(o, options),
    o => allowPreOrIsNotPre(o, options),
    options.enginesNode ? o => satisfiesNodeEngine(o, options.nodeEngineVersion) : null!,
  ])
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
export async function defaultPrefix(options: Options) {
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
export const list = async (options: Options = {}, spawnOptions?: SpawnOptions) => {
  const jsonLines = await spawnYarn('list', options as Index<string>, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...spawnOptions,
  })
  const json = await parseJsonLines(jsonLines)
  return cint.mapObject(json.dependencies, (name, info) => ({
    // unmet peer dependencies have a different structure
    [name]: info.version || (info.required && info.required.version),
  }))
}

/**
 * Fetches the highest version number, regardless of tag or publish time.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const greatest: GetVersion = async (packageName, currentVersion, options: Options = {}) => {
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfigFromYarn(options),
  )) as Packument[]

  return (
    _.last(
      // eslint-disable-next-line fp/no-mutating-methods
      _.filter(versions, filterPredicate(options))
        .map(o => o.version)
        .sort(versionUtil.compareVersions),
    ) || null
  )
}

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const distTag: GetVersion = async (packageName, currentVersion, options: Options = {}) => {
  const revision = (await viewOne(
    packageName,
    `dist-tags.${options.distTag}`,
    currentVersion,
    {
      registry: options.registry,
      timeout: options.timeout,
      retry: options.retry,
    },
    npmConfigFromYarn(options),
  )) as unknown as Packument // known type based on dist-tags.latest

  // latest should not be deprecated
  // if latest exists and latest is not a prerelease version, return it
  // if latest exists and latest is a prerelease version and --pre is specified, return it
  // if latest exists and latest not satisfies min version of engines.node
  if (revision && filterPredicate(options)(revision)) return revision.version

  // If we use a custom dist-tag, we do not want to get other 'pre' versions, just the ones from this dist-tag
  if (options.distTag && options.distTag !== 'latest') return null

  // if latest is a prerelease version and --pre is not specified
  // or latest is deprecated
  // find the next valid version
  // known type based on dist-tags.latest
  return greatest(packageName, currentVersion, options)
}

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
export const newest: GetVersion = async (packageName: string, currentVersion, options = {}) => {
  const result = await viewManyMemoized(
    packageName,
    ['time', 'versions'],
    currentVersion,
    options,
    0,
    npmConfigFromYarn(options),
  )

  const versionsSatisfyingNodeEngine = _.filter(result.versions, version =>
    satisfiesNodeEngine(version, options.nodeEngineVersion),
  ).map((o: Packument) => o.version)

  const versions = Object.keys(result.time || {}).reduce(
    (accum: string[], key: string) =>
      accum.concat(TIME_FIELDS.includes(key) || versionsSatisfyingNodeEngine.includes(key) ? key : []),
    [],
  )

  const versionsWithTime = _.pullAll(versions, TIME_FIELDS)

  return (
    _.last(options.pre !== false ? versions : versionsWithTime.filter(version => !versionUtil.isPre(version))) || null
  )
}

/**
 * Fetches the highest version with the same major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const minor: GetVersion = async (packageName, currentVersion, options = {}) => {
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfigFromYarn(options),
  )) as Packument[]
  return versionUtil.findGreatestByLevel(
    _.filter(versions, filterPredicate(options)).map(o => o.version),
    currentVersion,
    'minor',
  )
}

/**
 * Fetches the highest version with the same minor and major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const patch: GetVersion = async (packageName, currentVersion, options = {}) => {
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfigFromYarn(options),
  )) as Packument[]
  return versionUtil.findGreatestByLevel(
    _.filter(versions, filterPredicate(options)).map(o => o.version),
    currentVersion,
    'patch',
  )
}

export default spawnYarn
