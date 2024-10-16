import camelCase from 'camelcase'
import memoize from 'fast-memoize'
import fs from 'fs'
import ini from 'ini'
import npmRegistryFetch from 'npm-registry-fetch'
import path from 'path'
import nodeSemver from 'semver'
import { parseRange } from 'semver-utils'
import spawn from 'spawn-please'
import untildify from 'untildify'
import pkg from '../../package.json'
import filterObject from '../lib/filterObject'
import { keyValueBy } from '../lib/keyValueBy'
import libnpmconfig from '../lib/libnpmconfig'
import { print, printSorted } from '../lib/logging'
import { sortBy } from '../lib/sortBy'
import * as versionUtil from '../lib/version-util'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { MockedVersions } from '../types/MockedVersions'
import { NpmConfig } from '../types/NpmConfig'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { Packument } from '../types/Packument'
import { SpawnPleaseOptions } from '../types/SpawnPleaseOptions'
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

/** Returns true if the version is sa valid, exact version. */
const isExactVersion = (version: Version) =>
  version && (!nodeSemver.validRange(version) || versionUtil.isWildCard(version))

/** Fetches a packument or dist-tag from the npm registry. */
const fetchPartialPackument = async (
  name: string,
  fields: (keyof Packument)[],
  tag: string | null,
  opts: npmRegistryFetch.FetchOptions = {},
  version?: Version,
): Promise<Partial<Packument>> => {
  const corgiDoc = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
  const fullDoc = 'application/json'

  const registry = npmRegistryFetch.pickRegistry(name, opts)
  const headers = {
    'user-agent': opts.userAgent || `npm-check-updates/${pkg.version} node/${process.version}`,
    'ncu-version': pkg.version,
    'ncu-pkg-id': `registry:${name}`,
    accept: opts.fullMetadata ? fullDoc : corgiDoc,
    ...opts.headers,
  }
  const url = new URL(
    // since the registry API expects /package or /package/version encoding
    // scoped packages is needed as to not treat the package scope as the full
    // package name and the actual package name as the version/dist-tag
    encodeURIComponent(name),
    // the WhatWG URL standard, when given a base URL to place the first
    // parameter relative to, will find the dirname of the base, treating the
    // last segment as a file name and not a directory name if it isn't
    // terminated by a / and thus remove it before adding the first argument
    // to the URL.
    // this is undesirable for registries configured without a trailing slash
    // in the npm config since, for example looking up the package @foo/bar
    // will give the following results given these configured registry URL:s
    //    https://example.com/npm  => https://example.com/%40foo%2fbar
    //    https://example.com/npm/ => https://example.com/npm/%40foo%2fbar
    // however, like npm itself does there should be leniency allowed in this.
    registry.endsWith('/') ? registry : `${registry}/`,
  )
  if (version) {
    url.pathname += `/${version}`
  }
  const fetchOptions = {
    ...opts,
    headers,
    spec: name,
  }

  try {
    if (opts.fullMetadata) {
      return npmRegistryFetch.json(url.href, fetchOptions)
    } else {
      tag = tag || 'latest'
      // typescript does not type async iteratable stream correctly so we need to cast it
      const stream = npmRegistryFetch.json.stream(url.href, '$*', fetchOptions) as unknown as IterableIterator<{
        key: keyof Packument
        value: Packument[keyof Packument]
      }>

      const partialPackument: Partial<Packument> = { name }

      for await (const { key, value } of stream) {
        if (fields.includes(key)) {
          // TODO: Fix type
          partialPackument[key] = value as any
          if (Object.keys(partialPackument).length === fields.length + 1) {
            break
          }
        }
      }

      return partialPackument
    }
  } catch (err: any) {
    if (err.code !== 'E404' || opts.fullMetadata) {
      throw err
    }

    // possible that corgis are not supported by this registry
    return fetchPartialPackument(name, fields, tag, { ...opts, fullMetadata: true }, version)
  }
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
      // synchronous since it is loaded once on startup, and to avoid complexity in libnpmconfig
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
    const opts = libnpmconfig(null, {
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
  const result = await fetchPartialPackument(packageName, ['versions'], null, {
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
      return currentAuthor !== latestAuthor
    }
  }

  return false
}

/** Returns true if an object is a Packument. */
const isPackument = (o: any): o is Partial<Packument> => !!(o && (o.name || o.engines || o.version || o.versions))

/** Creates a function with the same signature as fetchUpgradedPackument that always returns the given versions. */
export const mockFetchUpgradedPackument =
  (mockReturnedVersions: MockedVersions): typeof fetchUpgradedPackument =>
  (name: string, fields: (keyof Packument)[], currentVersion: Version, options: Options) => {
    // a partial Packument
    const partialPackument =
      typeof mockReturnedVersions === 'function'
        ? mockReturnedVersions(options)?.[name]
        : typeof mockReturnedVersions === 'string' || isPackument(mockReturnedVersions)
          ? mockReturnedVersions
          : mockReturnedVersions[name]

    const version = isPackument(partialPackument) ? partialPackument.version : partialPackument

    if (!version) {
      throw new Error(
        `fetchUpgradedPackument is mocked, but no mock version was supplied for ${name}. Make sure that all dependencies are mocked. `,
      )
    }

    const time = (isPackument(partialPackument) && partialPackument.time?.[version]) || new Date().toISOString()
    const packument: Packument = {
      name,
      'dist-tags': {
        [options.distTag || 'latest']: version,
      },
      engines: { node: '' },
      time: {
        [version]: time,
      },
      version,
      // overwritten below
      versions: {},
      ...(isPackument(partialPackument) ? partialPackument : null),
    }

    const { versions: _, ...packumentWithoutVersions } = packument

    return Promise.resolve({
      ...packument,
      versions: {
        ...((isPackument(partialPackument) && partialPackument.versions) || {
          [version]: packumentWithoutVersions,
        }),
      },
    })
  }

/** Merges the workspace, global, user, local, project, and cwd npm configs (in that order). */
// Note that this is memoized on configs and options, but not on package name. This avoids duplicate messages when log level is verbose. findNpmConfig is memoized on config path, so it is not expensive to call multiple times.
const mergeNpmConfigs = memoize(
  (
    {
      npmConfigLocal,
      npmConfigUser,
      npmConfigWorkspaceProject,
    }: {
      npmConfigLocal?: NpmConfig
      npmConfigUser?: NpmConfig
      npmConfigWorkspaceProject?: NpmConfig
    },
    options: Options,
  ) => {
    // merge project npm config with base config
    const npmConfigProjectPath = options.packageFile ? path.join(options.packageFile, '../.npmrc') : null
    const npmConfigProject = options.packageFile ? findNpmConfig(npmConfigProjectPath || undefined) : null
    const npmConfigCWDPath = options.cwd ? path.join(options.cwd, '.npmrc') : null
    const npmConfigCWD = options.cwd ? findNpmConfig(npmConfigCWDPath!) : null

    if (npmConfigWorkspaceProject && Object.keys(npmConfigWorkspaceProject).length > 0) {
      print(options, `\nnpm config (workspace project):`, 'verbose')
      const { cache: _, ...npmConfigWorkspaceProjectWithoutCache } = npmConfigWorkspaceProject
      printSorted(options, npmConfigWorkspaceProjectWithoutCache, 'verbose')
    }

    if (npmConfigUser && Object.keys(npmConfigUser).length > 0) {
      print(options, `\nnpm config (user):`, 'verbose')
      const { cache: _, ...npmConfigUserWithoutCache } = npmConfigUser
      printSorted(options, npmConfigUserWithoutCache, 'verbose')
    }

    if (npmConfigLocal && Object.keys(npmConfigLocal).length > 0) {
      print(options, `\nnpm config (local override):`, 'verbose')
      const { cache: _, ...npmConfigLocalWithoutCache } = npmConfigLocal
      printSorted(options, npmConfigLocalWithoutCache, 'verbose')
    }

    if (npmConfigProject && Object.keys(npmConfigProject).length > 0) {
      print(options, `\nnpm config (project: ${npmConfigProjectPath}):`, 'verbose')
      const { cache: _, ...npmConfigProjectWithoutCache } = npmConfigProject
      printSorted(options, npmConfigProjectWithoutCache, 'verbose')
    }

    if (npmConfigCWD && Object.keys(npmConfigCWD).length > 0) {
      print(options, `\nnpm config (cwd: ${npmConfigCWDPath}):`, 'verbose')
      // omit cache since it is added to every config
      const { cache: _, ...npmConfigCWDWithoutCache } = npmConfigCWD
      printSorted(options, npmConfigCWDWithoutCache, 'verbose')
    }

    const npmConfigMerged = {
      ...npmConfigWorkspaceProject,
      ...npmConfigUser,
      ...npmConfigLocal,
      ...npmConfigProject,
      ...npmConfigCWD,
      ...(options.registry ? { registry: options.registry, silent: true } : null),
      ...(options.timeout ? { timeout: options.timeout } : null),
    }

    const isMerged = npmConfigWorkspaceProject || npmConfigLocal || npmConfigProject || npmConfigCWD
    if (isMerged) {
      print(options, `\nmerged npm config:`, 'verbose')
      // omit cache since it is added to every config
      // @ts-expect-error -- though not typed, but the "cache" property does exist on the object and needs to be omitted
      const { cache: _, ...npmConfigMergedWithoutCache } = npmConfigMerged
      printSorted(options, npmConfigMergedWithoutCache, 'verbose')
    }

    return npmConfigMerged
  },
)

/**
 * Returns an object of specified values retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param fields        Array of fields like versions, time, version
 * @param               currentVersion
 * @returns             dist-tags field return Index<Packument>, time field returns Index<Index<string>>>, versions field returns Index<Index<Packument>>
 */
async function fetchUpgradedPackument(
  packageName: string,
  fields: (keyof Packument)[],
  currentVersion: Version,
  options: Options,
  retried = 0,
  npmConfigLocal?: NpmConfig,
  npmConfigWorkspaceProject?: NpmConfig,
): Promise<Partial<Packument> | undefined> {
  // See: /test/helpers/stubVersions
  if (process.env.STUB_VERSIONS) {
    const mockReturnedVersions = JSON.parse(process.env.STUB_VERSIONS)
    return mockFetchUpgradedPackument(mockReturnedVersions)(packageName, fields, currentVersion, options)
  }

  if (isExactVersion(currentVersion)) {
    return Promise.resolve({} as Index<Packument>)
  }

  // fields may already include time
  const fieldsExtended =
    options.format?.includes('time') && !fields.includes('time') ? ([...fields, 'time'] as (keyof Packument)[]) : fields
  const fullMetadata = fieldsExtended.includes('time')

  const npmConfigMerged = mergeNpmConfigs(
    {
      npmConfigUser: { ...npmConfig, fullMetadata },
      npmConfigLocal,
      npmConfigWorkspaceProject,
    },
    options,
  )

  let result: Partial<Packument> | undefined
  try {
    const tag = options.distTag || 'latest'
    result = await fetchPartialPackument(
      packageName,
      Array.from(
        new Set([
          'dist-tags',
          ...fields,
          ...(!options.deprecated ? (['deprecated', 'versions'] as const) : []),
          ...(options.enginesNode ? (['engines', 'versions'] as const) : []),
        ]),
      ),
      fullMetadata ? null : tag,
      npmConfigMerged,
    )
  } catch (err: any) {
    if (options.retry && ++retried <= options.retry) {
      return fetchUpgradedPackument(packageName, fieldsExtended, currentVersion, options, retried, npmConfigLocal)
    }

    throw err
  }

  return result
}

/** Memoize fetchUpgradedPackument for --deep and --workspaces performance. */
// must be exported to stub
export const fetchUpgradedPackumentMemo = memoize(fetchUpgradedPackument, {
  // serializer args are incorrectly typed as any[] instead of being generic, so we need to cast it
  serializer: (([
    packageName,
    fields,
    currentVersion,
    options,
    retried,
    npmConfigLocal,
    npmConfigWorkspaceProject,
  ]: Parameters<typeof fetchUpgradedPackument>) => {
    // packageFile varies by cwd in workspaces/deep mode, so we do not want to memoize on that
    const { packageFile: _, ...optionsWithoutPackageFile } = options
    return JSON.stringify([
      packageName,
      fields,
      // currentVersion does not change the behavior of fetchUpgradedPackument unless it is an invalid/inexact version which causes it to short circuit
      isExactVersion(currentVersion),
      optionsWithoutPackageFile,
      // make sure retries do not get memoized
      retried,
      npmConfigLocal,
      npmConfigWorkspaceProject,
    ])
  }) as (args: any[]) => string,
})

/**
 * Spawns npm with --json. Handles different commands for Window and Linux/OSX.
 *
 * @param args
 * @param [npmOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
async function spawnNpm(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnPleaseOptions: SpawnPleaseOptions = {},
  spawnOptions: Index<any> = {},
): Promise<any> {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  const fullArgs = [
    ...(npmOptions.global ? [`--global`] : []),
    ...(npmOptions.prefix ? [`--prefix=${npmOptions.prefix}`] : []),
    '--json',
    ...(Array.isArray(args) ? args : [args]),
  ]
  const { stdout } = await spawn(cmd, fullArgs, spawnPleaseOptions, spawnOptions)
  return stdout
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
  const spawnOptions = {}

  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const sanitizedSpawnOptions = process.platform === 'win32' ? { ...spawnOptions, shell: true } : spawnOptions

  let prefix: string | undefined

  // catch spawn error which can occur on Windows
  // https://github.com/raineorshine/npm-check-updates/issues/703
  try {
    const { stdout } = await spawn(cmd, ['config', 'get', 'prefix'], {}, sanitizedSpawnOptions)
    prefix = stdout
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
  const versions = (
    await fetchUpgradedPackumentMemo(packageName, ['versions'], currentVersion, options, 0, npmConfig, npmConfigProject)
  )?.versions

  return {
    version:
      Object.values(versions || {})
        .filter(filterPredicate(options))
        .map(o => o.version)
        .sort(versionUtil.compareVersions)
        .at(-1) || null,
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
  const args = ['view', `${packageName}@${version}`, 'peerDependencies']
  const result = await spawnNpm(args, {}, { rejectOnError: false })
  return result ? parseJson(result, { command: [...args, '--json'].join(' ') }) : {}
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
  npmConfigLocal?: NpmConfig,
): Promise<Index<VersionSpec | undefined>> => {
  const result = await fetchPartialPackument(
    packageName,
    [`engines`],
    null,
    {
      ...npmConfigLocal,
      ...npmConfig,
      ...(options.registry ? { registry: options.registry, silent: true } : null),
    },
    version,
  )
  return result.engines || {}
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
      ...(options.global ? { global: true } : null),
      ...(options.prefix ? { prefix: options.prefix } : null),
    },
    {
      rejectOnError: false,
    },
    {
      ...(options.cwd ? { cwd: options.cwd } : null),
    },
  )
  const dependencies = parseJson<{
    dependencies: Index<{ version?: Version; required?: { version: Version } }>
  }>(result, {
    command: `npm${process.platform === 'win32' ? '.cmd' : ''} ls --json${options.global ? ' --global' : ''}`,
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
  const packument = await fetchUpgradedPackumentMemo(
    packageName,
    ['dist-tags'],
    currentVersion,
    options,
    0,
    npmConfig,
    npmConfigProject,
  )
  const version = packument?.['dist-tags']?.[options.distTag || 'latest']

  // if the packument does not contain versions, we need to add a minimal versions property with the upgraded version
  const tagPackument = packument?.versions
    ? packument.versions?.[version!]
    : {
        name: packageName,
        version,
      }

  // latest should not be deprecated
  // if latest exists and latest is not a prerelease version, return it
  // if latest exists and latest is a prerelease version and --pre is specified, return it
  // if latest exists and latest not satisfies min version of engines.node
  if (tagPackument && filterPredicate(options)(tagPackument)) {
    return {
      version: tagPackument.version,
      ...(packument?.time?.[version!] ? { time: packument.time[version!] } : null),
    }
  }

  // If we use a custom dist-tag, we do not want to get other 'pre' versions, just the ones from this dist-tag
  if (options.distTag && options.distTag !== 'latest') return {}

  // if latest is a prerelease version and --pre is not specified
  // or latest is deprecated
  // find the next valid version
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
  const result = await fetchUpgradedPackumentMemo(
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
  const versionsSatisfyingNodeEngine = keyValueBy(
    result?.versions || {},
    (version: Version, packument: Packument['versions'][string]) =>
      satisfiesNodeEngine(packument, options.nodeEngineVersion) ? { [packument.version]: true } : null,
  )

  // filter out times that do not satisfy the node engine
  // filter out prereleases if pre:false (same as allowPreOrIsNotPre)
  const timesSatisfyingNodeEngine = filterObject(
    (result?.time || {}) as Index<string>,
    version => versionsSatisfyingNodeEngine[version] && (options.pre !== false || !versionUtil.isPre(version)),
  )

  // sort by timestamp (entry[1]) and map versions
  const versionsSortedByTime = sortBy(Object.entries(timesSatisfyingNodeEngine), v => v[1]).map(([version]) => version)

  return { version: versionsSortedByTime.at(-1) }
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
  const versions = (
    await fetchUpgradedPackumentMemo(packageName, ['versions'], currentVersion, options, 0, npmConfig, npmConfigProject)
  )?.versions as Index<Packument>
  const version = versionUtil.findGreatestByLevel(
    Object.values(versions || {})
      .filter(filterPredicate(options))
      .map(o => o.version),
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
  const versions = (
    await fetchUpgradedPackumentMemo(packageName, ['versions'], currentVersion, options, 0, npmConfig, npmConfigProject)
  )?.versions as Index<Packument>
  const version = versionUtil.findGreatestByLevel(
    Object.values(versions || {})
      .filter(filterPredicate(options))
      .map(o => o.version),
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
  const versions = (
    await fetchUpgradedPackumentMemo(packageName, ['versions'], currentVersion, options, 0, npmConfig, npmConfigProject)
  )?.versions as Index<Packument>
  // ignore explicit version ranges
  if (isExplicitRange(currentVersion)) return { version: null }

  const versionsFiltered = Object.values(versions || {})
    .filter(filterPredicate(options))
    .map(o => o.version)
  // TODO: Upgrading within a prerelease does not seem to work.
  // { includePrerelease: true } does not help.
  const version = nodeSemver.maxSatisfying(versionsFiltered, currentVersion)
  return { version }
}

export default spawnNpm
