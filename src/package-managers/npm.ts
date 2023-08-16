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
import nodeSemver from 'semver'
import { parseRange } from 'semver-utils'
import spawn from 'spawn-please'
import untildify from 'untildify'
import filterObject from '../lib/filterObject'
import { keyValueBy } from '../lib/keyValueBy'
import libnpmconfig from '../lib/libnpmconfig'
import { print } from '../lib/logging'
import * as versionUtil from '../lib/version-util'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { MockedVersions } from '../types/MockedVersions'
import { NpmConfig } from '../types/NpmConfig'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { Packument } from '../types/Packument'
import { Version } from '../types/Version'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'
import { filterPredicate, satisfiesNodeEngine } from './filters'

const EXPLICIT_RANGE_OPS = new Set(['-', '||', '&&', '<', '<=', '>', '>='])

/** Returns true if the spec is an explicit version range (not ~ or ^). */
const isExplicitRange = (spec: VersionSpec) => {
  const range = parseRange(spec)
  return range.some(parsed => EXPLICIT_RANGE_OPS.has(parsed.operator || ''))
}

/** Normalizes the keys of an npm config for pacote. */
export const normalizeNpmConfig = (
  npmConfig: NpmConfig,
  // config path used to determine relative cafile paths
  configPath?: string,
): NpmConfig => {
  const npmConfigToPacoteMap = {
    cafile: (capath: string): undefined | { ca: string[] } => {
      // load-cafile, based on github.com/npm/cli/blob/40c1b0f/lib/config/load-cafile.js
      if (!capath) return
      // synchronous since it is loaded once on startup, and to avoid complexity in libnpmconfig.read
      // https://github.com/raineorshine/npm-check-updates/issues/636?notification_referrer_id=MDE4Ok5vdGlmaWNhdGlvblRocmVhZDc0Njk2NjAzMjo3NTAyNzY%3D
      const cadata = fs.readFileSync(path.resolve(configPath || '', untildify(capath)), 'utf8')
      const delim = '-----END CERTIFICATE-----'
      const output: string[] = cadata
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
    timeout: 'number',
  }

  /** Parses a string to a boolean. */
  const stringToBoolean = (s: string): boolean => !!s && s !== 'false' && s !== '0'

  /** Parses a string to a number. */
  const stringToNumber = (s: string): number => parseInt(s) || 0

  // needed until pacote supports full npm config compatibility
  // See: https://github.com/zkat/pacote/issues/156
  const config: NpmConfig = keyValueBy(npmConfig, (key: string, value: NpmConfig[keyof NpmConfig]) => {
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
    const { [key]: pacoteKey }: Index<NpmConfig[keyof NpmConfig]> = npmConfigToPacoteMap

    return typeof pacoteKey === 'string'
      ? // key is mapped to a string
        { [pacoteKey]: normalizedValue }
      : // key is mapped to a function
      typeof pacoteKey === 'function'
      ? { ...(pacoteKey(normalizedValue.toString()) as any) }
      : // otherwise assign the camel-cased key
        { [key.match(/^[a-z]/i) ? camelCase(key) : key]: normalizedValue }
  })

  return config
}

/** Finds and parses the npm config at the given path. If the path does not exist, returns null. If no path is provided, finds and merges the global and user npm configs using libnpmconfig and sets cache: false. */
const findNpmConfig = memoize((configPath?: string): NpmConfig | null => {
  let config

  if (configPath) {
    try {
      config = ini.parse(fs.readFileSync(configPath, 'utf-8'))
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

  return normalizeNpmConfig(config, configPath)
})

// get the base config that is used for all npm queries
// this may be partially overwritten by .npmrc config files when using --deep
const npmConfig = findNpmConfig()

/** A promise that returns true if --global is deprecated on the system npm. Spawns "npm --version". */
const isGlobalDeprecated = memoize(async () => {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const output = await spawn(cmd, ['--version'])
  const npmVersion = output.trim()
  // --global was deprecated in npm v8.11.0.
  return nodeSemver.valid(npmVersion) && nodeSemver.gte(npmVersion, '8.11.0')
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
function parseJson<R>(result: string, data: { command?: string; packageName?: string }): R {
  let json
  try {
    json = JSON.parse(result)
  } catch (err) {
    throw new Error(
      `Expected JSON from "${data.command}".${
        data.packageName ? ` There could be problems with the ${data.packageName} package.` : ''
      } ${result ? 'Instead received: ' + result : 'Received empty response.'}`,
    )
  }
  return json as R
}

/**
 * Check if package author changed between current and upgraded version.
 *
 * @param packageName Name of the package
 * @param currentVersion Current version declaration (may be range)
 * @param upgradedVersion Upgraded version declaration (may be range)
 * @param npmConfigLocal Additional npm config variables that are merged into the system npm config
 * @returns A promise that fulfills with boolean value.
 */
export async function packageAuthorChanged(
  packageName: string,
  currentVersion: VersionSpec,
  upgradedVersion: VersionSpec,
  options: Options = {},
  npmConfigLocal?: NpmConfig,
): Promise<boolean> {
  const result = await pacote.packument(packageName, {
    ...npmConfigLocal,
    ...npmConfig,
    fullMetadata: true,
    ...(options.registry ? { registry: options.registry, silent: true } : null),
  })
  if (result.versions) {
    const pkgVersions = Object.keys(result.versions)
    const current = nodeSemver.minSatisfying(pkgVersions, currentVersion)
    const upgraded = nodeSemver.maxSatisfying(pkgVersions, upgradedVersion)
    if (current && upgraded && result.versions[current]._npmUser && result.versions[upgraded]._npmUser) {
      const currentAuthor = result.versions[current]._npmUser?.name
      const latestAuthor = result.versions[upgraded]._npmUser?.name
      return !isEqual(currentAuthor, latestAuthor)
    }
  }

  return false
}

/** Returns true if an object is a Packument. */
const isPackument = (o: any): o is Partial<Packument> => o && (o.name || o.engines || o.version || o.versions)

/** Creates a function with the same signature as viewMany that always returns the given versions. */
export const mockViewMany =
  (mockReturnedVersions: MockedVersions): typeof viewMany =>
  (name: string, fields: string[], currentVersion: Version, options: Options) => {
    // a partial Packument
    const partialPackument =
      typeof mockReturnedVersions === 'function'
        ? mockReturnedVersions(options)?.[name]
        : typeof mockReturnedVersions === 'string' || isPackument(mockReturnedVersions)
        ? mockReturnedVersions
        : mockReturnedVersions[name]

    const version = isPackument(partialPackument) ? partialPackument.version : partialPackument

    // if there is no version, hard exit
    // otherwise getPackageProtected will swallow the error
    if (!version) {
      console.error(`No mock version supplied for ${name}`)
      process.exit(1)
    }

    const time = (isPackument(partialPackument) && partialPackument.time?.[version]) || new Date().toISOString()
    const packument: Packument = {
      name,
      engines: { node: '' },
      time: {
        [version]: time,
      },
      version,
      // overwritten below
      versions: [],
      ...(isPackument(partialPackument) ? partialPackument : null),
    }

    return Promise.resolve(
      keyValueBy(fields, field => ({
        [field]:
          field === 'versions'
            ? ({
                [version]: packument,
              } as Index<Packument>)
            : field === 'time'
            ? ({
                [version]: time,
              } as Index<string>)
            : ({
                ...packument,
                versions: [packument],
              } as Packument),
      })),
    )
  }

/**
 * Returns an object of specified values retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param fields        Array of fields like versions, time, version
 * @param               currentVersion
 * @returns             dist-tags field return Index<Packument>, time field returns Index<Index<string>>>, versions field returns Index<Index<Packument>>
 */
async function viewMany(
  packageName: string,
  fields: string[],
  currentVersion: Version,
  options: Options,
  retried = 0,
  npmConfigLocal?: NpmConfig,
  npmConfigWorkspaceProject?: NpmConfig,
): Promise<Index<Packument | Index<string> | Index<Packument>>> {
  // See: /test/helpers/stubNpmView
  if (process.env.STUB_NPM_VIEW) {
    const mockReturnedVersions = JSON.parse(process.env.STUB_NPM_VIEW)
    return mockViewMany(mockReturnedVersions)(packageName, fields, currentVersion, options)
  }

  if (currentVersion && (!nodeSemver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
    return Promise.resolve({} as Index<Packument>)
  }

  const fieldsExtended = options.format?.includes('time') ? [...fields, 'time'] : fields

  // merge project npm config with base config
  const npmConfigProjectPath = options.packageFile ? path.join(options.packageFile, '../.npmrc') : null
  const npmConfigProject = options.packageFile ? findNpmConfig(npmConfigProjectPath || undefined) : null
  const npmConfigCWDPath = options.cwd ? path.join(options.cwd, '.npmrc') : null
  const npmConfigCWD = options.cwd ? findNpmConfig(npmConfigCWDPath!) : null

  if (npmConfigWorkspaceProject && Object.keys(npmConfigWorkspaceProject).length > 0) {
    print(options, `\nnpm config (workspace project):`, 'verbose')
    print(options, omit(npmConfigWorkspaceProject, 'cache'), 'verbose')
  }

  if (npmConfig && Object.keys(npmConfig).length > 0) {
    print(options, `\nnpm config (local):`, 'verbose')
    print(options, omit(npmConfig, 'cache'), 'verbose')
  }

  if (npmConfigLocal && Object.keys(npmConfigLocal).length > 0) {
    print(options, `\nnpm config (local override):`, 'verbose')
    print(options, omit(npmConfigLocal, 'cache'), 'verbose')
  }

  if (npmConfigProject && Object.keys(npmConfigProject).length > 0) {
    print(options, `\npm config (project: ${npmConfigProjectPath}):`, 'verbose')
    print(options, omit(npmConfigProject, 'cache'), 'verbose')
  }

  if (npmConfigCWD && Object.keys(npmConfigCWD).length > 0) {
    print(options, `\nnpm config (cwd: ${npmConfigCWDPath}):`, 'verbose')
    // omit cache since it is added to every config
    print(options, omit(npmConfigCWD, 'cache'), 'verbose')
  }

  const npmConfigMerged = {
    ...npmConfigWorkspaceProject,
    ...npmConfig,
    ...npmConfigLocal,
    ...npmConfigProject,
    ...npmConfigCWD,
    ...(options.registry ? { registry: options.registry, silent: true } : null),
    ...(options.timeout ? { timeout: options.timeout } : null),
    fullMetadata: fieldsExtended.includes('time'),
  }

  const isMerged = npmConfigWorkspaceProject || npmConfigLocal || npmConfigProject || npmConfigCWD
  print(options, `\nUsing${isMerged ? ' merged' : ''} npm config:`, 'verbose')
  // omit cache since it is added to every config
  print(options, omit(npmConfigMerged, 'cache'), 'verbose')

  let result: any
  try {
    result = (await pacote.packument(packageName, npmConfigMerged)) as any
  } catch (err: any) {
    if (options.retry && ++retried <= options.retry) {
      return viewMany(packageName, fieldsExtended, currentVersion, options, retried, npmConfigLocal)
    }

    throw err
  }

  // select each field from the result object
  const resultNormalized = keyValueBy(fields, field => {
    let value = result[field]

    // index into the result object to get the dist-tag
    if (field.startsWith('dist-tags.') && result.versions) {
      const packument: Packument = result.versions[get(result, field) as unknown as string]
      // since viewOne only keeps a single field, we need to add time onto the dist-tag field
      value = options.format?.includes('time') ? { ...packument, time: result.time } : packument
    }

    return {
      [field]: value,
    }
  })

  return resultNormalized
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
  npmConfigProject?: NpmConfig,
): Promise<string | boolean | { engines: { node: string } } | undefined | Index<string> | Index<Packument>> {
  const result = await viewManyMemoized(
    packageName,
    [field],
    currentVersion,
    options,
    0,
    npmConfigLocal,
    npmConfigProject,
  )
  return result[field]
}

/**
 * Spawns npm with --json. Handles different commands for Window and Linux/OSX, and automatically converts --location=global to --global on node < 8.11.0.
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
      ? (await isGlobalDeprecated())
        ? `--location=${npmOptions.location}`
        : npmOptions.location === 'global'
        ? '--global'
        : ''
      : [],
    npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : [],
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
export const greatest: GetVersion = async (
  packageName,
  currentVersion,
  options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
): Promise<VersionResult> => {
  // known type based on 'versions'
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfig,
    npmConfigProject,
  )) as Index<Packument>

  return {
    version:
      last(
        // eslint-disable-next-line fp/no-mutating-methods
        filter(versions, filterPredicate(options))
          .map(o => o.version)
          .sort(versionUtil.compareVersions),
      ) || null,
  }
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
  const args = ['view', `${packageName}${atVersion}`, 'peerDependencies']
  const result = await spawnNpm(args, {}, { rejectOnError: false })
  return result ? parseJson(result, { command: [...args, '--json'].join(' ') }) : {}
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
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  const result = await spawnNpm(
    ['ls', '--depth=0'],
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
  const dependencies = parseJson<{
    dependencies: Index<{ version?: Version; required?: { version: Version } }>
  }>(result, {
    command: `npm${process.platform === 'win32' ? '.cmd' : ''} ls --json${options.global ? ' --location=global' : ''}${
      options.prefix ? ' --prefix ' + options.prefix : ''
    }`,
  }).dependencies

  return keyValueBy(dependencies, (name, info) => ({
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
export const distTag: GetVersion = async (
  packageName,
  currentVersion,
  options: Options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
) => {
  const packument = (await viewOne(
    packageName,
    `dist-tags.${options.distTag}`,
    currentVersion,
    options,
    npmConfig,
    npmConfigProject,
  )) as unknown as Packument // known type based on dist-tags.latest

  // latest should not be deprecated
  // if latest exists and latest is not a prerelease version, return it
  // if latest exists and latest is a prerelease version and --pre is specified, return it
  // if latest exists and latest not satisfies min version of engines.node
  if (packument && filterPredicate(options)(packument)) {
    return {
      version: packument.version,
      ...(packument.time?.[packument.version] ? { time: packument.time[packument.version] } : null),
    }
  }

  // If we use a custom dist-tag, we do not want to get other 'pre' versions, just the ones from this dist-tag
  if (options.distTag && options.distTag !== 'latest') return {}

  // if latest is a prerelease version and --pre is not specified
  // or latest is deprecated
  // find the next valid version
  // known type based on dist-tags.latest
  return greatest(packageName, currentVersion, options, npmConfig, npmConfigProject)
}

/**
 * Fetches the version published to the latest tag.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const latest: GetVersion = async (
  packageName: string,
  currentVersion: Version,
  options: Options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
) => distTag(packageName, currentVersion, { ...options, distTag: 'latest' }, npmConfig, npmConfigProject)

/**
 * Fetches the most recently published version, regardless of version number.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const newest: GetVersion = async (
  packageName,
  currentVersion,
  options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
): Promise<VersionResult> => {
  const result = await viewManyMemoized(
    packageName,
    ['time', 'versions'],
    currentVersion,
    options,
    0,
    npmConfig,
    npmConfigProject,
  )

  // Generate a map of versions that satisfy the node engine.
  // result.versions is an object but is parsed as an array, so manually convert it to an object.
  // Otherwise keyValueBy will pass the predicate arguments in the wrong order.
  const versionsSatisfyingNodeEngine = keyValueBy(Object.values(result.versions || {}), (packument: Packument) =>
    satisfiesNodeEngine(packument, options.nodeEngineVersion) ? { [packument.version]: true } : null,
  )

  // filter out times that do not satisfy the node engine
  // filter out prereleases if pre:false (same as allowPreOrIsNotPre)
  const timesSatisfyingNodeEngine = filterObject(
    (result.time || {}) as unknown as Index<string>,
    version => versionsSatisfyingNodeEngine[version] && (options.pre !== false || !versionUtil.isPre(version)),
  )

  // sort by timestamp (entry[1]) and map versions
  const versionsSortedByTime = sortBy(Object.entries(timesSatisfyingNodeEngine), 1).map(([version]) => version)

  return { version: last(versionsSortedByTime) }
}

/**
 * Fetches the highest version with the same major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const minor: GetVersion = async (
  packageName,
  currentVersion,
  options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
): Promise<VersionResult> => {
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfig,
    npmConfigProject,
  )) as Index<Packument>
  const version = versionUtil.findGreatestByLevel(
    filter(versions, filterPredicate(options)).map(o => o.version),
    currentVersion,
    'minor',
  )
  return { version }
}

/**
 * Fetches the highest version with the same minor and major version as currentVersion.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const patch: GetVersion = async (
  packageName,
  currentVersion,
  options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
): Promise<VersionResult> => {
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfig,
    npmConfigProject,
  )) as Index<Packument>
  const version = versionUtil.findGreatestByLevel(
    filter(versions, filterPredicate(options)).map(o => o.version),
    currentVersion,
    'patch',
  )
  return { version }
}

/**
 * Fetches the highest version that satisfies the semver range specified in the package.json.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns
 */
export const semver: GetVersion = async (
  packageName,
  currentVersion,
  options = {},
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
): Promise<VersionResult> => {
  const versions = (await viewOne(
    packageName,
    'versions',
    currentVersion,
    options,
    npmConfig,
    npmConfigProject,
  )) as Index<Packument>
  // ignore explicit version ranges
  if (isExplicitRange(currentVersion)) return { version: null }

  const versionsFiltered = filter(versions, filterPredicate(options)).map(o => o.version)
  // TODO: Upgrading within a prerelease does not seem to work.
  // { includePrerelease: true } does not help.
  const version = nodeSemver.maxSatisfying(versionsFiltered, currentVersion)
  return { version }
}

export default spawnNpm
