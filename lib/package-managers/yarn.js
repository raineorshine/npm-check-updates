'use strict'

// This file is my change based on the npm.js file.
// The main function is to provide a check and update function for packages installed globally using yarn.
// Since I only have windows system equipment here, I cannot guarantee that it can run 100% on Mac.
// At the same time, there is nothing I can do about unit testing.

const fs = require('fs')
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
 * @param result Data to be parsed
 * @param data
 * @returns
 */
async function parseJsonLines(result, data) {
  const lockFile = fs.readFileSync(
    `${process.env.LOCALAPPDATA}\\Yarn\\Data\\global\\yarn.lock`,
    { encoding: 'utf8' })
  const json = { dependencies: {} }

  const parser = jsonlines.parse()

  parser.on('data', function(d) {
    if (d.type === 'info') {
      const pkgInfo = d.data.match(/"(@?.*)@(.*)"/)

      const pkgName = pkgInfo[1]
      const pkgVersion = pkgInfo[2]

      const r = new RegExp(`http.*/${pkgName}/.*\\w`)
      const resolvedUrl = lockFile.match(r)[0]

      json.dependencies[pkgName] = {
        version: pkgVersion,
        from: pkgName,
        resolved: resolvedUrl,
      }

    }
  })

  parser.write(result)

  parser.end()

  await once(parser, 'end')

  return json

}

/**
 * Returns the value of one of the properties retrieved by yarn view.
 *
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.yarnjs.com/package/pacote#packument)
 * @param currentVersion
 * @returns            Promised result
 */
function viewOne(packageName, field, currentVersion, { timeout } = {}) {
  return viewMany(packageName, [field], currentVersion, { timeout })
    .then(result => result && result[field])
}

/**
 * Returns an object of specified values retrieved by yarn view.
 *
 * @param packageName   Name of the package
 * @param fields      Array of fields like versions, time, version
 * @param currentVersion
 * @returns            Promised result
 */
function viewMany(packageName, fields, currentVersion, { timeout } = {}) {
  if (currentVersion && (!semver.validRange(currentVersion) ||
    versionUtil.isWildCard(currentVersion))) {
    return Promise.resolve({})
  }

  yarnConfig.fullMetadata = fields.includes('time')

  return pacote.packument(packageName, { ...yarnConfig, timeout })
    .then(result =>
      fields.reduce((accum, field) => ({
        ...accum,
        [field]: field.startsWith('dist-tags.') && result.versions ?
          result.versions[_.get(result, field)] :
          result[field],
      }), {})
    )
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
    '--json'
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
function defaultPrefix(options) {

  if (options.prefix) {
    return Promise.resolve(options.prefix)
  }

  const cmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

  return spawn(cmd, ['global', 'dir']).then(prefix => {
    // FIX: for ncu -g doesn't work on homebrew or windows #146
    // https://github.com/raineorshine/npm-check-updates/issues/146

    return options.global && prefix.match('Cellar') ? '/usr/local' :

      // Workaround: get prefix on windows for global packages
      // Only needed when using npm api directly
      process.platform === 'win32' && options.global && !process.env.prefix ?
        prefix ? prefix.trim() : `${process.env.LOCALAPPDATA}\\Yarn\\Data\\global` :
        null
  })
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

    return spawnYarn('list', options, options.cwd
      ? { cwd: options.cwd, rejectOnError: false }
      : { rejectOnError: false }).then(async result => {
      const json = await parseJsonLines(result, {
        command: 'yarn list --depth=0',
      })

      return cint.mapObject(json.dependencies, (name, info) => ({
        // unmet peer dependencies have a different structure
        [name]: info.version || (info.required && info.required.version),
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
    return viewOne(packageName, 'dist-tags.latest', currentVersion,
      { timeout: options.timeout }).then(latest => {
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
  greatestMajor(packageName, currentVersion, options = {}) {
    return viewOne(packageName, 'versions', currentVersion,
      { timeout: options.timeout }).then(versions =>
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

  defaultPrefix,
}
