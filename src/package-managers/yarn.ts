'use strict'

// eslint-disable-next-line fp/no-events
import { once, EventEmitter } from 'events'
import _ from 'lodash'
import cint from 'cint'
import semver from 'semver'
import spawn from 'spawn-please'
import libnpmconfig from 'libnpmconfig'
import jsonlines from 'jsonlines'
import * as versionUtil from '../version-util'
import { viewOne, viewManyMemoized } from './npm'
import { GetVersion, Index, Options, Packument, Version, YarnOptions } from '../types'

interface ParsedDep {
  version: string,
  from: string,
}

const TIME_FIELDS = ['modified', 'created']

// needed until pacote supports full yarn config compatibility
// See: https://github.com/zkat/pacote/issues/156
const yarnConfig: Index<string | boolean> = {}
libnpmconfig.read().forEach((value: string | boolean, key: string) => {
  // replace env ${VARS} in strings with the process.env value
  yarnConfig[key] = typeof value !== 'string' ?
    value :
    value.replace(/\${([^}]+)}/, (_, envVar) =>
      process.env[envVar] as string
    )
})
yarnConfig.cache = false

/**
 * @typedef {object} CommandAndPackageName
 * @property {string} command
 * @property {string} packageName
 */

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

    }
    else if (d.type === 'error') {
      throw new Error(d.data)
    }
  })

  parser.write(result)

  parser.end()

  await once(parser as unknown as EventEmitter, 'end')

  return { dependencies }

}

/**
 * @param versions  Array of all available versions
 * @param pre     Enabled prerelease?
 * @returns         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions: Version[], pre: boolean) {
  return pre ? versions : versions.filter(
    version => !versionUtil.isPre(version))
}

/**
 * @param versions            Object with all versions
 * @param nodeEngineVersion   Package engines.node range
 * @returns An array of versions which satisfies engines.node range
 */
function doesSatisfyEnginesNode(versions: Packument[], nodeEngineVersion?: Version) {
  if (!versions) return []
  if (!nodeEngineVersion) return Object.keys(versions)

  const minVersion = _.get(semver.minVersion(nodeEngineVersion), 'version')
  if (!minVersion) return Object.keys(versions)

  return versions.filter(version => {
    const versionEnginesNode = _.get(version, 'engines.node')
    return versionEnginesNode &&
      semver.satisfies(minVersion, versionEnginesNode)
  })
}

/**
 * Spawn yarn requires a different command on Windows.
 *
 * @param args
 * @param [yarnOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
function spawnYarn(args: string | string[], yarnOptions: YarnOptions = {}, spawnOptions: Index<string> = {}): Promise<string> {
  const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

  const fullArgs = ([] as string[]).concat(
    yarnOptions.global ? 'global' : [],
    args,
    '--depth=0',
    yarnOptions.prefix ? `--prefix=${yarnOptions.prefix}` : [],
    '--json',
    '--no-progress'
  )
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
    .catch(() => { /* empty */ })

  // FIX: for ncu -g doesn't work on homebrew or windows #146
  // https://github.com/raineorshine/npm-check-updates/issues/146

  return options.global && prefix && prefix.match('Cellar')
    ? '/usr/local'
    // Workaround: get prefix on windows for global packages
    // Only needed when using npm api directly
    : process.platform === 'win32' && options.global && !process.env.prefix ?
      prefix ? prefix.trim() : `${process.env.LOCALAPPDATA}\\Yarn\\Data\\global` :
      null
}

/**
 * @param [options]
 * @param [options.cwd]
 * @param [options.global]
 * @param [options.prefix]
 * @returns
 */
export const list = (options: Options = {}) => {

  return spawnYarn('list', options as Index<string>, options.cwd ? { cwd: options.cwd } : {}).then(async jsonLines => {
    const json = await parseJsonLines(jsonLines)

    return cint.mapObject(json.dependencies, (name, info) => ({
      // unmet peer dependencies have a different structure
      [name]: info.version || (info.required && info.required.version),
    }))
  })
    .catch(async jsonLines => {
      await parseJsonLines(jsonLines)
      return {}
    })
}

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const latest: GetVersion = async (packageName: string, currentVersion: Version, options: Options = {}) => {
  const latest = await viewOne(packageName, 'dist-tags.latest', currentVersion, options) as unknown as Packument

  // if latest exists and latest is not a prerelease version, return it
  // if latest exists and latest is a prerelease version and --pre is specified, return it
  // if latest exists and latest not satisfies min version of engines.node
  if (latest && (!versionUtil.isPre(latest.version) || options.pre) &&
    doesSatisfyEnginesNode([latest], options.nodeEngineVersion).length) {
    return latest.version
    // if latest is a prerelease version and --pre is not specified, find the next
    // version that is not a prerelease
  }
  else {
    const versions = await viewOne(packageName, 'versions', currentVersion) as Packument[]
    const versionsSatisfyingNodeEngine = doesSatisfyEnginesNode(versions, options.nodeEngineVersion) as string[]
    return _.last(filterOutPrereleaseVersions(versionsSatisfyingNodeEngine, !!options.pre)) || null
  }
}

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const newest: GetVersion = (packageName: string, currentVersion, options = {}) => {
  return viewManyMemoized(packageName, ['time', 'versions'], currentVersion, options).then(result => {
    // todo
    const versions = doesSatisfyEnginesNode(result.versions, options.nodeEngineVersion) as Version[]
    return Object.keys(result.time || {}).reduce((accum: string[], key) =>
      accum.concat(
        TIME_FIELDS.includes(key) || (versions).includes(key) ? key : []), []
    )
  }).then(_.partialRight(_.pullAll, TIME_FIELDS)).then(versions =>
    _.last(filterOutPrereleaseVersions(versions as Version[],
      options.pre == null || options.pre)) || null
  )
}

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const greatest: GetVersion = async (packageName, currentVersion, options = {}) => {
  const versions = await viewOne(packageName, 'versions', currentVersion, options) as Packument[]
  // eslint-disable-next-line fp/no-mutating-methods
  return _.last(filterOutPrereleaseVersions(
    doesSatisfyEnginesNode(versions, options.nodeEngineVersion) as Version[],
    options.pre == null || options.pre).sort(versionUtil.compareVersions)
  ) || null
}

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const minor: GetVersion = async (packageName, currentVersion, options = {}) => {
  const versions = await viewOne(packageName, 'versions', currentVersion, options) as Packument[]
  return versionUtil.findGreatestByLevel(
    filterOutPrereleaseVersions(
      doesSatisfyEnginesNode(versions, options.nodeEngineVersion) as Version[],
      !!options.pre
    ),
    currentVersion,
    'minor'
  )
}

/**
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const patch: GetVersion = async (packageName, currentVersion, options = {}) => {
  const versions = await viewOne(packageName, 'versions', currentVersion, options) as Packument[]
  return versionUtil.findGreatestByLevel(
    filterOutPrereleaseVersions(
      doesSatisfyEnginesNode(versions, options.nodeEngineVersion) as Version[],
      !!options.pre
    ),
    currentVersion,
    'patch'
  )
}
