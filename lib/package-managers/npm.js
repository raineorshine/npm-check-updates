'use strict'

const _ = require('lodash')
const cint = require('cint')
const fs = require('fs')
const semver = require('semver')
const spawn = require('spawn-please')
const pacote = require('pacote')
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
 * Returns the value of one of the properties retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.npmjs.com/package/pacote#packument)
 * @param currentVersion
 * @returns            Promised result
 */
function viewOne(packageName, field, currentVersion, { timeout } = {}) {
  return viewMany(packageName, [field], currentVersion, { timeout })
    .then(result => result && result[field])
}

/**
 * Returns an object of specified values retrieved by npm view.
 *
 * @param packageName   Name of the package
 * @param fields      Array of fields like versions, time, version
 * @param currentVersion
 * @returns            Promised result
 */
function viewMany(packageName, fields, currentVersion, { timeout } = {}) {
  if (currentVersion && (!semver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
    return Promise.resolve({})
  }

  npmConfig.fullMetadata = fields.includes('time')

  return pacote.packument(packageName, { ...npmConfig, timeout }).then(result =>
    fields.reduce((accum, field) => ({
      ...accum,
      [field]: field.startsWith('dist-tags.') && result.versions ?
        result.versions[_.get(result, field)] :
        result[field]
    }), {})
  )
}

/**
 * @param versions  Array of all available versions
 * @param pre     Enabled prerelease?
 * @returns         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions, pre) {
  return pre ? versions : versions.filter(version => !versionUtil.isPre(version))
}

/**
 * @param versions    Object with all versions
 * @param enginesNode Package engines.node range
 * @returns An array of versions which satisfies engines.node range
 */
function doesSatisfyEnginesNode(versions, enginesNode) {
  if (!versions) {
    return []
  }
  if (!enginesNode) {
    return Object.keys(versions)
  }
  const minVersion = _.get(semver.minVersion(enginesNode), 'version')
  if (!minVersion) {
    return Object.keys(versions)
  }
  return Object.keys(versions).filter(version => {
    const versionEnginesNode = _.get(versions[version], 'engines.node')
    return versionEnginesNode && semver.satisfies(minVersion, versionEnginesNode)
  })
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

  /**
   * @param [options]
   * @param [options.cwd]
   * @param [options.global]
   * @param [options.prefix]
   * @returns
   */
  list(options = {}) {

    return spawnNpm('ls', options, options.cwd ? { cwd: options.cwd, rejectOnError: false } : { rejectOnError: false })
      .then(result => {
        const json = parseJson(result, {
          command: 'npm ls'
        })
        return cint.mapObject(json.dependencies, (name, info) => ({
        // unmet peer dependencies have a different structure
          [name]: info.version || (info.required && info.required.version)
        }))
      })
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  latest(packageName, currentVersion, options = {}) {
    return viewOne(packageName, 'dist-tags.latest', currentVersion, { timeout: options.timeout })
      .then(latest => {
        // if latest exists and latest is not a prerelease version, return it
        // if latest exists and latest is a prerelease version and --pre is specified, return it
        // if latest exists and latest not satisfies min version of engines.node
        if (latest && (!versionUtil.isPre(latest.version) || options.pre) && doesSatisfyEnginesNode({ [latest.version]: latest }, options.enginesNode).length) {
          return latest.version
          // if latest is a prerelease version and --pre is not specified, find the next
          // version that is not a prerelease
        }
        else {
          return viewOne(packageName, 'versions', currentVersion)
            .then(versions => {
              versions = doesSatisfyEnginesNode(versions, options.enginesNode)
              return _.last(filterOutPrereleaseVersions(versions, options.pre))
            })
        }
      })
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  newest(packageName, currentVersion, options = {}) {
    return viewMany(packageName, ['time', 'versions'], currentVersion, { timeout: options.timeout })
      .then(result => {
        const versions = doesSatisfyEnginesNode(result.versions, options.enginesNode)
        return Object.keys(result.time || {}).reduce((accum, key) =>
          accum.concat(TIME_FIELDS.includes(key) || versions.includes(key) ? key : []), []
        )
      })
      .then(_.partialRight(_.pullAll, TIME_FIELDS))
      .then(versions =>
        _.last(filterOutPrereleaseVersions(versions, options.pre == null || options.pre))
      )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  greatest(packageName, currentVersion, options = {}) {
    return viewOne(packageName, 'versions', currentVersion, { timeout: options.timeout })
      .then(versions =>
        // eslint-disable-next-line fp/no-mutating-methods
        _.last(filterOutPrereleaseVersions(
          doesSatisfyEnginesNode(versions, options.enginesNode),
          options.pre == null || options.pre)
          .sort(versionUtil.compareVersions)
        )
      )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  greatestMajor(packageName, currentVersion, options = {}) {
    return viewOne(packageName, 'versions', currentVersion, { timeout: options.timeout })
      .then(versions =>
        versionUtil.findGreatestByLevel(
          filterOutPrereleaseVersions(
            doesSatisfyEnginesNode(versions, options.enginesNode),
            options.pre
          ),
          currentVersion,
          'major'
        )
      )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  greatestMinor(packageName, currentVersion, options) {
    return viewOne(packageName, 'versions', currentVersion, { timeout: options.timeout })
      .then(versions =>
        versionUtil.findGreatestByLevel(
          filterOutPrereleaseVersions(
            doesSatisfyEnginesNode(versions, options.enginesNode),
            options.pre
          ),
          currentVersion,
          'minor'
        )
      )
  },

  defaultPrefix
}
