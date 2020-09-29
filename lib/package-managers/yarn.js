'use strict'

// eslint-disable-next-line fp/no-events
const { once } = require('events')

const _ = require('lodash')
const cint = require('cint')
const semver = require('semver')
const spawn = require('spawn-please')
const pacote = require('pacote')
const libnpmconfig = require('libnpmconfig')

const jsonlines = require('jsonlines')

const versionUtil = require('../version-util')

const TIME_FIELDS = ['modified', 'created']

// needed until pacote supports full yarn config compatibility
// See: https://github.com/zkat/pacote/issues/156
const yarnConfig = {}
libnpmconfig.read().forEach((value, key) => {
  // replace env ${VARS} in strings with the process.env value
  yarnConfig[key] = typeof value !== 'string' ?
    value :
    value.replace(/\${([^}]+)}/, (_, envVar) =>
      process.env[envVar]
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
async function parseJsonLines(result) {

  const dependencies = {}

  const parser = jsonlines.parse()

  parser.on('data', d => {
    // only parse info data
    // ignore error info, e.g. "Visit https://yarnpkg.com/en/docs/cli/list for documentation about this command."
    if (d.type === 'info' && !d.data.match(/^Visit/)) {

      // parse package name and version number from info data, e.g. "nodemon@2.0.4" has binaries
      const [, pkgName, pkgVersion] = d.data.match(/"(@?.*)@(.*)"/)

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

  await once(parser, 'end')

  return { dependencies }

}

/**
 * Returns the value of one of the properties retrieved by yarn view.
 *
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.yarnjs.com/package/pacote#packument)
 * @param currentVersion
 * @returns            Promised result
 */
async function viewOne(packageName, field, currentVersion, { timeout } = {}) {
  const result = await viewMany(packageName, [field], currentVersion, { timeout })
  return result && result[field]
}

/**
 * Returns an object of specified values retrieved by yarn view.
 *
 * @param packageName   Name of the package
 * @param fields      Array of fields like versions, time, version
 * @param currentVersion
 * @returns            Promised result
 */
async function viewMany(packageName, fields, currentVersion, { timeout } = {}) {
  if (currentVersion && (!semver.validRange(currentVersion) ||
    versionUtil.isWildCard(currentVersion))) {
    return Promise.resolve({})
  }

  yarnConfig.fullMetadata = fields.includes('time')

  const result = await pacote.packument(packageName, { ...yarnConfig, timeout })
  return fields.reduce((accum, field) => ({
    ...accum,
    [field]: field.startsWith('dist-tags.') && result.versions ?
      result.versions[_.get(result, field)] :
      result[field],
  }), {})
}

/**
 * @param versions  Array of all available versions
 * @param pre     Enabled prerelease?
 * @returns         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions, pre) {
  return pre ? versions : versions.filter(
    version => !versionUtil.isPre(version))
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
function spawnYarn(args, yarnOptions = {}, spawnOptions = {}) {
  const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

  const fullArgs = [].concat(
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
async function defaultPrefix(options) {

  if (options.prefix) {
    return Promise.resolve(options.prefix)
  }

  const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

  const prefix = await spawn(cmd, ['global', 'dir'])

  // FIX: for ncu -g doesn't work on homebrew or windows #146
  // https://github.com/raineorshine/npm-check-updates/issues/146

  return options.global && prefix.match('Cellar')
    ? '/usr/local'
    // Workaround: get prefix on windows for global packages
    // Only needed when using npm api directly
    : process.platform === 'win32' && options.global && !process.env.prefix ?
      prefix ? prefix.trim() : `${process.env.LOCALAPPDATA}\\Yarn\\Data\\global` :
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

    return spawnYarn('list', options, options.cwd ? { cwd: options.cwd } : {}).then(async jsonLines => {
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
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  async latest(packageName, currentVersion, options = {}) {
    const latest = await viewOne(packageName, 'dist-tags.latest', currentVersion,
      { timeout: options.timeout })

    // if latest exists and latest is not a prerelease version, return it
    // if latest exists and latest is a prerelease version and --pre is specified, return it
    // if latest exists and latest not satisfies min version of engines.node
    if (latest && (!versionUtil.isPre(latest.version) || options.pre) &&
      doesSatisfyEnginesNode({ [latest.version]: latest },
        options.enginesNode).length) {
      return latest.version
      // if latest is a prerelease version and --pre is not specified, find the next
      // version that is not a prerelease
    }
    else {
      const versions = await viewOne(packageName, 'versions', currentVersion)
      const versionsSatisfyingNodeEngine = doesSatisfyEnginesNode(versions, options.enginesNode)
      return _.last(filterOutPrereleaseVersions(versionsSatisfyingNodeEngine, options.pre))
    }
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  newest(packageName, currentVersion, options = {}) {
    return viewMany(packageName, ['time', 'versions'], currentVersion,
      { timeout: options.timeout }).then(result => {
      const versions = doesSatisfyEnginesNode(result.versions,
        options.enginesNode)
      return Object.keys(result.time || {}).reduce((accum, key) =>
        accum.concat(
          TIME_FIELDS.includes(key) || versions.includes(key) ? key : []), []
      )
    }).then(_.partialRight(_.pullAll, TIME_FIELDS)).then(versions =>
      _.last(filterOutPrereleaseVersions(versions,
        options.pre == null || options.pre))
    )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  greatest(packageName, currentVersion, options = {}) {
    return viewOne(packageName, 'versions', currentVersion,
      { timeout: options.timeout }).then(versions =>
      // eslint-disable-next-line fp/no-mutating-methods
      _.last(filterOutPrereleaseVersions(
        doesSatisfyEnginesNode(versions, options.enginesNode),
        options.pre == null || options.pre).sort(versionUtil.compareVersions)
      )
    )
  },

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  minor(packageName, currentVersion, options = {}) {
    return viewOne(packageName, 'versions', currentVersion,
      { timeout: options.timeout }).then(versions =>
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

  /**
   * @param packageName
   * @param currentVersion
   * @param options
   * @returns
   */
  patch(packageName, currentVersion, options) {
    return viewOne(packageName, 'versions', currentVersion,
      { timeout: options.timeout }).then(versions =>
      versionUtil.findGreatestByLevel(
        filterOutPrereleaseVersions(
          doesSatisfyEnginesNode(versions, options.enginesNode),
          options.pre
        ),
        currentVersion,
        'patch'
      )
    )
  },

  defaultPrefix,
}
