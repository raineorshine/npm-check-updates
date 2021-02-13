'use strict'

const _ = require('lodash')
const cint = require('cint')
const fs = require('fs')
const semver = require('semver')
const spawn = require('spawn-please')
const pacote = require('pacote')
const mem = require('mem')
const libnpmconfig = require('libnpmconfig')
const versionUtil = require('../version-util')
const { print } = require('../logging')

const TIME_FIELDS = ['modified', 'created']

const npmConfigToPacoteMap = {
  cafile: path => {
    // load-cafile, based on github.com/npm/cli/blob/40c1b0f/lib/config/load-cafile.js
    if (!path) return
    const cadata = fs.readFileSync(path, 'utf8')
    const delim = '-----END CERTIFICATE-----'
    const output = cadata
      .split(delim)
      .filter(xs => !!xs.trim())
      .map(xs => `${xs.trimLeft()}${delim}`)
    return { ca: output }
  },
  maxsockets: 'maxSockets',
  'strict-ssl': 'strictSSL',
}

// needed until pacote supports full npm config compatibility
// See: https://github.com/zkat/pacote/issues/156
const npmConfig = {}
libnpmconfig.read().forEach((value, key) => {
  // replace env ${VARS} in strings with the process.env value
  const normalizedValue = typeof value !== 'string' ?
    value :
    value.replace(/\${([^}]+)}/, (_, envVar) =>
      process.env[envVar]
    )

  const { [key]: pacoteKey } = npmConfigToPacoteMap
  if (_.isString(pacoteKey)) {
    npmConfig[pacoteKey] = normalizedValue
  }
  else if (_.isFunction(pacoteKey)) {
    _.assign(npmConfig, pacoteKey(normalizedValue))
  }
  else {
    npmConfig[key.match(/^[a-z]/i) ? _.camelCase(key) : key] = normalizedValue
  }
})
npmConfig.cache = false

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
function parseJson(result, data) {
  let json
  // use a try-catch instead of .catch to avoid re-catching upstream errors
  try {
    json = JSON.parse(result)
  }
  catch (err) {
    throw new Error(`Expected JSON from "${data.command}". This could be due to npm instability${data.packageName ? ` or problems with the ${data.packageName} package` : ''}.\n\n${result}`)
  }
  return json
}

/**
 * Check if package author changed between current and upgraded version.
 *
 * @param packageName Name of the package
 * @param currentVersion Current version declaration (may be range)
 * @param upgradedVersion Upgraded version declaration (may be range)
 * @returns A promise that fullfills with boolean value.
 */
async function packageAuthorChanged(packageName, currentVersion, upgradedVersion, options = {}) {

  const result = await pacote.packument(packageName, {
    ...npmConfig,
    fullMetadata: true,
    registry: options.registry,
  })
  if (result.versions) {
    const pkgVersions = Object.keys(result.versions)
    const current = semver.minSatisfying(pkgVersions, currentVersion)
    const upgraded = semver.maxSatisfying(pkgVersions, upgradedVersion)
    if (current && upgraded && result.versions[current]._npmUser && result.versions[upgraded]._npmUser) {
      const currentAuthor = result.versions[current]._npmUser.name
      const latestAuthor = result.versions[upgraded]._npmUser.name
      return !_.isEqual(currentAuthor, latestAuthor)
    }
  }

  return null
}

/**
 * Returns the value of one of the properties retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.npmjs.com/package/pacote#packument)
 * @param currentVersion
 * @returns            Promised result
 */
async function viewOne(packageName, field, currentVersion, options = {}) {
  const result = await viewManyMemoized(packageName, [field], currentVersion, options)
  return result && result[field]
}

/**
 * Returns an object of specified values retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param fields        Array of fields like versions, time, version
 * @param               currentVersion
 * @returns             Promised result
 */
async function viewMany(packageName, fields, currentVersion, { registry, timeout } = {}) {
  if (currentVersion && (!semver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
    return Promise.resolve({})
  }

  const result = await pacote.packument(packageName, {
    ...npmConfig,
    fullMetadata: fields.includes('time'),
    registry,
    timeout,
  })
  return fields.reduce((accum, field) => ({
    ...accum,
    [field]: field.startsWith('dist-tags.') && result.versions ?
      result.versions[_.get(result, field)] :
      result[field]
  }), {})
}

/** Memoize viewMany for --deep performance. */
const viewManyMemoized = mem(viewMany, {
  cacheKey: ([packageName, fields, currentVersion]) =>
    `${packageName}|${fields.join('|')}|${currentVersion}`
})

/**
 * Returns true if the node engine requirement is satisfied or not specified for a given package version.
 *
 * @param versionResult   Version object returned by pacote.packument.
 * @param nodeEngine      The value of engines.node in the package file.
 * @returns               True if the node engine requirement is satisfied or not specified.
 */
function satisfiesNodeEngine(versionResult, nodeEngine) {
  if (!nodeEngine) return true
  const minVersion = _.get(semver.minVersion(nodeEngine), 'version')
  if (!minVersion) return true
  const versionNodeEngine = _.get(versionResult, 'engines.node')
  return versionNodeEngine && semver.satisfies(minVersion, versionNodeEngine)
}

/** Returns a composite predicate that filters out deprecated, prerelease, and node engine incompatibilies from version objects returns by pacote.packument. */
function filterPredicate(options) {
  return _.overEvery([
    options.deprecated ? null : o => !o.deprecated,
    options.pre ? null : o => !versionUtil.isPre(o.version),
    options.enginesNode ? o => satisfiesNodeEngine(o, options.enginesNode) : null,
  ])
}

/**
 * Spawn npm requires a different command on Windows.
 *
 * @param args
 * @param [npmOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
function spawnNpm(args, npmOptions = {}, spawnOptions = {}) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  const fullArgs = [].concat(
    args,
    npmOptions.global ? '--global' : [],
    npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : [],
    '--depth=0',
    '--json'
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
async function defaultPrefix(options) {

  if (options.prefix) {
    return Promise.resolve(options.prefix)
  }

  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  let prefix

  // catch spawn error which can occur on Windows
  // https://github.com/raineorshine/npm-check-updates/issues/703
  try {
    prefix = await spawn(cmd, ['config', 'get', 'prefix'])
  }
  catch (e) {
    const message = (e.message || e || '').toString()
    print(options, 'Error executing `npm config get prefix`. Caught and ignored. Unsolved: https://github.com/raineorshine/npm-check-updates/issues/703. ERROR: ' + message, 'verbose', 'error')
  }

  // FIX: for ncu -g doesn't work on homebrew or windows #146
  // https://github.com/raineorshine/npm-check-updates/issues/146
  return options.global && prefix.match('Cellar') ? '/usr/local' :

    // Workaround: get prefix on windows for global packages
    // Only needed when using npm api directly
    process.platform === 'win32' && options.global && !process.env.prefix ?
      prefix ? prefix.trim() : `${process.env.AppData}\\npm` :
      null
}

module.exports = {

  npm: spawnNpm,

  /**
   * @param [options]
   * @param [options.cwd]
   * @param [options.global]
   * @param [options.prefix]
   * @returns
   */
  async list(options = {}) {

    const result = await spawnNpm('ls', options, {
      ...options.cwd ? { cwd: options.cwd } : null,
      rejectOnError: false
    })
    const json = parseJson(result, { command: 'npm ls' })
    return cint.mapObject(json.dependencies, (name, info) => ({
      // unmet peer dependencies have a different structure
      [name]: info.version || (info.required && info.required.version)
    }))
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  async latest(packageName, currentVersion, options = {}) {

    const latest = await viewOne(packageName, 'dist-tags.latest', currentVersion, {
      registry: options.registry,
      timeout: options.timeout,
    })

    // latest should not be deprecated
    // if latest exists and latest is not a prerelease version, return it
    // if latest exists and latest is a prerelease version and --pre is specified, return it
    // if latest exists and latest not satisfies min version of engines.node
    if (latest && filterPredicate(options)(latest)) return latest.version

    // if latest is a prerelease version and --pre is not specified
    // or latest is deprecated
    // find the next valid version
    const versions = await viewOne(packageName, 'versions', currentVersion)
    const validVersions = _.filter(versions, filterPredicate(options))

    return _.last(validVersions.map(o => o.version))
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  async newest(packageName, currentVersion, options = {}) {

    const result = await viewManyMemoized(packageName, ['time', 'versions'], currentVersion, options)

    const versionsSatisfyingNodeEngine = _.filter(result.versions, version => satisfiesNodeEngine(version, options.enginesNode))
      .map(o => o.version)

    const versions = Object.keys(result.time || {}).reduce((accum, key) =>
      accum.concat(TIME_FIELDS.includes(key) || versionsSatisfyingNodeEngine.includes(key) ? key : []), []
    )

    const versionsWithTime = _.pullAll(versions, TIME_FIELDS)

    return _.last(options.pre !== false
      ? versions :
      versionsWithTime.filter(version => !versionUtil.isPre(version))
    )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  async greatest(packageName, currentVersion, options = {}) {
    const versions = await viewOne(packageName, 'versions', currentVersion, options)

    return _.last(
      // eslint-disable-next-line fp/no-mutating-methods
      _.filter(versions, filterPredicate(options))
        .map(o => o.version)
        .sort(versionUtil.compareVersions)
    )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  async minor(packageName, currentVersion, options = {}) {
    const versions = await viewOne(packageName, 'versions', currentVersion, options)
    return versionUtil.findGreatestByLevel(
      _.filter(versions, filterPredicate(options)).map(o => o.version),
      currentVersion,
      'minor'
    )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  async patch(packageName, currentVersion, options) {
    const versions = await viewOne(packageName, 'versions', currentVersion, options)
    return versionUtil.findGreatestByLevel(
      _.filter(versions, filterPredicate(options)).map(o => o.version),
      currentVersion,
      'patch'
    )
  },

  defaultPrefix,
  packageAuthorChanged,
  viewOne,
  viewMany,
  viewManyMemoized,
}
