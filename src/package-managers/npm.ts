import memoize from 'fast-memoize'
import fs from 'fs'
import ini from 'ini'
import camelCase from 'lodash/camelCase'
import filter from 'lodash/filter'
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import last from 'lodash/last'
import omit from 'lodash/omit'
import sortBy from 'lodash/sortBy'
import pacote from 'pacote'
import path from 'path'
import semver from 'semver'
import spawn from 'spawn-please'
import untildify from 'untildify'
import filterObject from '../lib/filterObject'
import { keyValueBy } from '../lib/keyValueBy'
import libnpmconfig from '../lib/libnpmconfig'
import { print } from '../lib/logging'
import * as versionUtil from '../lib/version-util'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { Packument } from '../types/Packument'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import { filterPredicate, satisfiesNodeEngine } from './filters'

type NpmConfig = Index<string | boolean | ((path: string) => any)>

/** Normalizes the keys of an npm config for pacote. */
const normalizeNpmConfig = (npmConfig: NpmConfig): NpmConfig => {
  const npmConfigToPacoteMap = {
    cafile: (path: string) => {
      // load-cafile, based on github.com/npm/cli/blob/40c1b0f/lib/config/load-cafile.js
      if (!path) return
      // synchronous since it is loaded once on startup, and to avoid complexity in libnpmconfig.read
      // https://github.com/raineorshine/npm-check-updates/issues/636?notification_referrer_id=MDE4Ok5vdGlmaWNhdGlvblRocmVhZDc0Njk2NjAzMjo3NTAyNzY%3D
      const cadata = fs.readFileSync(untildify(path), 'utf8')
      const delim = '-----END CERTIFICATE-----'
      const output = cadata
        .split(delim)
        .filter(xs => !!xs.trim())
        .map(xs => `${xs.trimStart()}${delim}`)
      return { ca: output }
    },
    maxsockets: 'maxSockets',
    'strict-ssl': 'strictSSL',
  }

  // all config variables are read in as strings, so we need to type coerce non-strings
  // lowercased and hyphens removed for comparison purposes
  const keyTypes: Index<'boolean' | 'number'> = {
    all: 'boolean',
    allowsameversion: 'boolean',
    audit: 'boolean',
    binlinks: 'boolean',
    color: 'boolean',
    commithooks: 'boolean',
    description: 'boolean',
    dev: 'boolean',
    diffignoreallspace: 'boolean',
    diffnameonly: 'boolean',
    diffnoprefix: 'boolean',
    difftext: 'boolean',
    dryrun: 'boolean',
    enginestrict: 'boolean',
    force: 'boolean',
    foregroundscripts: 'boolean',
    formatpackagelock: 'boolean',
    fund: 'boolean',
    gittagversion: 'boolean',
    global: 'boolean',
    globalstyle: 'boolean',
    ifpresent: 'boolean',
    ignorescripts: 'boolean',
    includestaged: 'boolean',
    includeworkspaceroot: 'boolean',
    installlinks: 'boolean',
    json: 'boolean',
    legacybundling: 'boolean',
    legacypeerdeps: 'boolean',
    link: 'boolean',
    long: 'boolean',
    offline: 'boolean',
    omitlockfileregistryresolved: 'boolean',
    packagelock: 'boolean',
    packagelockonly: 'boolean',
    parseable: 'boolean',
    preferoffline: 'boolean',
    preferonline: 'boolean',
    progress: 'boolean',
    readonly: 'boolean',
    rebuildbundle: 'boolean',
    save: 'boolean',
    savebundle: 'boolean',
    savedev: 'boolean',
    saveexact: 'boolean',
    saveoptional: 'boolean',
    savepeer: 'boolean',
    saveprod: 'boolean',
    shrinkwrap: 'boolean',
    signgitcommit: 'boolean',
    signgittag: 'boolean',
    strictpeerdeps: 'boolean',
    strictssl: 'boolean',
    timing: 'boolean',
    unicode: 'boolean',
    updatenotifier: 'boolean',
    usage: 'boolean',
    version: 'boolean',
    versions: 'boolean',
    workspacesupdate: 'boolean',
    diffunified: 'number',
    fetchretries: 'number',
    fetchretryfactor: 'number',
    fetchretrymaxtimeout: 'number',
    fetchretrymintimeout: 'number',
    fetchtimeout: 'number',
    logsmax: 'number',
    maxsockets: 'number',
    searchlimit: 'number',
    searchstaleness: 'number',
    ssopollfrequency: 'number',
  }

  /** Parses a string to a boolean. */
  const stringToBoolean = (s: string) => !!s && s !== 'false' && s !== '0'

  /** Parses a string to a number. */
  const stringToNumber = (s: string) => parseInt(s) || 0

  // needed until pacote supports full npm config compatibility
  // See: https://github.com/zkat/pacote/issues/156
  const config: NpmConfig = keyValueBy(npmConfig, (key: string, value: string | boolean | ((path: string) => any)) => {
    // replace env ${VARS} in strings with the process.env value
    const normalizedValue =
      typeof value !== 'string'
        ? value
        : // parse stringified booleans
        keyTypes[key.replace(/-/g, '').toLowerCase()] === 'boolean'
        ? stringToBoolean(value)
        : keyTypes[key.replace(/-/g, '').toLowerCase()] === 'number'
        ? stringToNumber(value)
        : value.replace(/\${([^}]+)}/, (_, envVar) => process.env[envVar] as string)

    // normalize the key for pacote
    const { [key]: pacoteKey }: Index<string | ((path: string) => any)> = npmConfigToPacoteMap

    return typeof pacoteKey === 'string'
      ? // key is mapped to a string
        { [pacoteKey]: normalizedValue }
      : // key is mapped to a function
      typeof pacoteKey === 'function'
      ? { ...pacoteKey(normalizedValue.toString()) }
      : // otherwise assign the camel-cased key
        { [key.match(/^[a-z]/i) ? camelCase(key) : key]: normalizedValue }
  })

  return config
}

/** Finds and parses the npm config at the given path. If the path does not exist, returns null. If no path is provided, finds and merges the global and user npm configs using libnpmconfig and sets cache: false. */
const findNpmConfig = (path?: string): NpmConfig | null => {
  let config

  if (path) {
    try {
      config = ini.parse(fs.readFileSync(path, 'utf-8'))
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null
      } else {
        throw err
      }
    }
  } else {
    // libnpmconfig incorrectly (?) ignores NPM_CONFIG_USERCONFIG because it is always overridden by the default builtin.userconfig
    // set userconfig manually so that it is prioritized
    const opts = libnpmconfig.read(null, {
      userconfig: process.env.npm_config_userconfig || process.env.NPM_CONFIG_USERCONFIG,
    })
    config = {
      ...opts.toJSON(),
      cache: false,
    }
  }

  return normalizeNpmConfig(config)
}

// get the base config that is used for all npm queries
// this may be partially overwritten by .npmrc config files when using --deep
const npmConfig = findNpmConfig()

/** A promise that returns true if --global is deprecated on the system npm. Spawns "npm --version". */
const isGlobalDeprecated = new Promise((resolve, reject) => {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return spawn(cmd, ['--version'])
    .then((output: string) => {
      const npmVersion = output.trim()
      // --global was deprecated in npm v8.11.0.
      resolve(semver.valid(npmVersion) && semver.gte(npmVersion, '8.11.0'))
    })
    .catch(reject)
})

/**
 * @typedef {object} CommandAndPackageName
 * @property {string} command
 * @property {string} packageName
 */

/**
 * Parse JSON and throw an informative error on failure.
 *
 * @param result Data to be parsed
 * @param data
 * @returns
 */
function parseJson(result: string, data: { command?: string; packageName?: string }) {
  let json
  // use a try-catch instead of .catch to avoid re-catching upstream errors
  try {
    json = JSON.parse(result)
  } catch (err) {
    throw new Error(
      `Expected JSON from "${data.command}". This could be due to npm instability${
        data.packageName ? ` or problems with the ${data.packageName} package` : ''
      }.\n\n${result}`,
    )
  }
  return json
}

/**
 * Check if package author changed between current and upgraded version.
 *
 * @param packageName Name of the package
 * @param currentVersion Current version declaration (may be range)
 * @param upgradedVersion Upgraded version declaration (may be range)
 * @param npmConfigLocal Additional npm config variables that are merged into the system npm config
 * @returns A promise that fullfills with boolean value.
 */
export async function packageAuthorChanged(
  packageName: string,
  currentVersion: VersionSpec,
  upgradedVersion: VersionSpec,
  options: Options = {},
  npmConfigLocal?: NpmConfig,
) {
  const result = await pacote.packument(packageName, {
    ...npmConfigLocal,
    ...npmConfig,
    fullMetadata: true,
    ...(options.registry ? { registry: options.registry, silent: true } : null),
  })
  if (result.versions) {
    const pkgVersions = Object.keys(result.versions)
    const current = semver.minSatisfying(pkgVersions, currentVersion)
    const upgraded = semver.maxSatisfying(pkgVersions, upgradedVersion)
    if (current && upgraded && result.versions[current]._npmUser && result.versions[upgraded]._npmUser) {
      const currentAuthor = result.versions[current]._npmUser?.name
      const latestAuthor = result.versions[upgraded]._npmUser?.name
      return !isEqual(currentAuthor, latestAuthor)
    }
  }

  return false
}

/**
 * Returns an object of specified values retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param fields        Array of fields like versions, time, version
 * @param               currentVersion
 * @returns             Promised result
 */
export async function viewMany(
  packageName: string,
  fields: string[],
  currentVersion: Version,
  options: Options,
  retried = 0,
  npmConfigLocal?: NpmConfig,
) {
  if (currentVersion && (!semver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
    return Promise.resolve({} as Packument)
  }

  // merge project npm config with base config
  const npmConfigProjectPath = options.packageFile ? path.join(options.packageFile, '../.npmrc') : null
  const npmConfigProject = options.packageFile ? findNpmConfig(npmConfigProjectPath!) : null
  const npmConfigCWDPath = options.cwd ? path.join(options.cwd, '.npmrc') : null
  const npmConfigCWD = options.cwd ? findNpmConfig(npmConfigCWDPath!) : null

  if (npmConfigProject) {
    print(options, `\nUsing npm config in project directory: ${npmConfigProjectPath}:`, 'verbose')
    print(options, omit(npmConfigProject, 'cache'), 'verbose')
  }

  if (npmConfigCWD) {
    print(options, `\nUsing npm config in current working directory: ${npmConfigCWDPath}:`, 'verbose')
    // omit cache since it is added to every config
    print(options, omit(npmConfigCWD, 'cache'), 'verbose')
  }

  const npmOptions = {
    ...npmConfig,
    ...npmConfigLocal,
    ...npmConfigProject,
    ...npmConfigCWD,
    ...(options.registry ? { registry: options.registry, silent: true } : null),
    ...(options.timeout ? { timeout: options.timeout } : null),
    fullMetadata: fields.includes('time'),
  }

  let result: any
  try {
    result = await pacote.packument(packageName, npmOptions)
  } catch (err: any) {
    if (options.retry && ++retried <= options.retry) {
      const packument: Packument = await viewMany(packageName, fields, currentVersion, options, retried, npmConfigLocal)
      return packument
    }

    throw err
  }
  return fields.reduce(
    (accum, field) => ({
      ...accum,
      [field]:
        field.startsWith('dist-tags.') && result.versions
          ? result.versions[get(result, field) as unknown as string]
          : result[field],
    }),
    {} as Packument,
  )
}

/** Memoize viewMany for --deep performance. */
export const viewManyMemoized = memoize(viewMany)

/**
 * Returns the value of one of the properties retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.npmjs.com/package/pacote#packument)
 * @param currentVersion
 * @returns            Promised result
 */
export async function viewOne(
  packageName: string,
  field: string,
  currentVersion: Version,
  options: Options,
  npmConfigLocal?: NpmConfig,
) {
  const result = await viewManyMemoized(packageName, [field], currentVersion, options, 0, npmConfigLocal)
  return result && result[field as keyof Packument]
}

/**
 * Spawns npm. Handles different commands for Window and Linux/OSX, and automatically converts --location=global to --global on node < 8.11.0.
 *
 * @param args
 * @param [npmOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
async function spawnNpm(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnOptions: Index<any> = {},
): Promise<any> {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  args = Array.isArray(args) ? args : [args]

  const fullArgs = args.concat(
    npmOptions.location
      ? (await isGlobalDeprecated)
        ? `--location=${npmOptions.location}`
        : npmOptions.location === 'global'
        ? '--global'
        : ''
      : [],
    npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : [],
    '--depth=0',
    '--json',
  )
  return spawn(cmd, fullArgs, spawnOptions)
}

/**
 * Get platform-specific default prefix to pass on to npm.
 *
 * @param options
 * @param [options.global]
 * @param [options.prefix]
 * @returns
 */
export async function defaultPrefix(options: Options): Promise<string | undefined> {
  if (options.prefix) {
    return Promise.resolve(options.prefix)
  }

  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  let prefix: string | undefined

  // catch spawn error which can occur on Windows
  // https://github.com/raineorshine/npm-check-updates/issues/703
  try {
    prefix = await spawn(cmd, ['config', 'get', 'prefix'])
  } catch (e: any) {
    const message = (e.message || e || '').toString()
    print(
      options,
      'Error executing `npm config get prefix`. Caught and ignored. Unsolved: https://github.com/raineorshine/npm-check-updates/issues/703. ERROR: ' +
        message,
      'verbose',
      'error',
    )
  }

  // FIX: for ncu -g doesn't work on homebrew or windows #146
  // https://github.com/raineorshine/npm-check-updates/issues/146
  return options.global && prefix?.match('Cellar')
    ? '/usr/local'
    : // Workaround: get prefix on windows for global packages
    // Only needed when using npm api directly
    process.platform === 'win32' && options.global && !process.env.prefix
    ? prefix
      ? prefix.trim()
      : `${process.env.AppData}\\npm`
    : undefined
}

/**
 * Fetches the highest version number, regardless of tag or publish time.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const greatest: GetVersion = async (packageName, currentVersion, options = {}): Promise<string | null> => {
  // known type based on 'versions'
  const versions = (await viewOne(packageName, 'versions', currentVersion, options)) as Packument[]

  return (
    last(
      // eslint-disable-next-line fp/no-mutating-methods
      filter(versions, filterPredicate(options))
        .map(o => o.version)
        .sort(versionUtil.compareVersions),
    ) || null
  )
}

/**
 * Fetches the list of peer dependencies for a specific package version.
 *
 * @param packageName
 * @param version
 * @returns Promised {packageName: version} collection
 */
export const getPeerDependencies = async (packageName: string, version: Version): Promise<Index<Version>> => {
  // if version number uses >, omit the version and find latest
  // otherwise, it will error out in the shell
  // https://github.com/raineorshine/npm-check-updates/issues/1181
  const atVersion = !version.startsWith('>') ? `@${version}` : ''
  const npmArgs = ['view', `${packageName}${atVersion}`, 'peerDependencies']
  const result = await spawnNpm(npmArgs, {}, { rejectOnError: false })
  return result ? parseJson(result, { command: `${npmArgs.join(' ')} --json` }) : {}
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
export const list = async (options: Options = {}) => {
  const result = await spawnNpm(
    'ls',
    {
      // spawnNpm takes the modern --location option and converts it to --global on older versions of npm
      ...(options.global ? { location: 'global' } : null),
      ...(options.prefix ? { prefix: options.prefix } : null),
    },
    {
      ...(options.cwd ? { cwd: options.cwd } : null),
      rejectOnError: false,
    },
  )
  const json = parseJson(result, {
    command: `npm${process.platform === 'win32' ? '.cmd' : ''} ls --json${options.global ? ' --location=global' : ''}`,
  }) as { dependencies: Index<any> }
  return keyValueBy(json.dependencies, (name, info) => ({
    // unmet peer dependencies have a different structure
    [name]: info.version || info.required?.version,
  }))
}

/**
 * Fetches the version of a package published to options.distTag.
 *
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
    options,
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
  return await greatest(packageName, currentVersion, options)
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
export const newest: GetVersion = async (packageName, currentVersion, options = {}): Promise<string | null> => {
  const result = await viewManyMemoized(packageName, ['time', 'versions'], currentVersion, options)

  // Generate a map of versions that satisfy the node engine.
  // result.versions is an object but is parsed as an array, so manually convert it to an object.
  // Otherwise keyValueBy will pass the predicate arguments in the wrong order.
  const versionsSatisfyingNodeEngine = keyValueBy(Object.values(result.versions || {}), packument =>
    satisfiesNodeEngine(packument, options.nodeEngineVersion) ? { [packument.version]: true } : null,
  )

  // filter out times that do not satisfy the node engine
  // filter out prereleases if pre:false (same as allowPreOrIsNotPre)
  const timesSatisfyingNodeEngine = filterObject(
    result.time || {},
    version => versionsSatisfyingNodeEngine[version] && (options.pre !== false || !versionUtil.isPre(version)),
  )

  // sort by timestamp (entry[1]) and map versions
  const versionsSortedByTime = sortBy(Object.entries(timesSatisfyingNodeEngine), 1).map(([version]) => version)

  return last(versionsSortedByTime) || null
}

/**
 * Fetches the highest version with the same major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const minor: GetVersion = async (packageName, currentVersion, options = {}): Promise<string | null> => {
  const versions = (await viewOne(packageName, 'versions', currentVersion, options)) as Packument[]
  return versionUtil.findGreatestByLevel(
    filter(versions, filterPredicate(options)).map(o => o.version),
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
export const patch: GetVersion = async (packageName, currentVersion, options = {}): Promise<string | null> => {
  const versions = (await viewOne(packageName, 'versions', currentVersion, options)) as Packument[]
  return versionUtil.findGreatestByLevel(
    filter(versions, filterPredicate(options)).map(o => o.version),
    currentVersion,
    'patch',
  )
}

export default spawnNpm
