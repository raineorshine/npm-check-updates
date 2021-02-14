/** Fetches package metadata from Github tags. */

const remoteGitTags = require('remote-git-tags')
const parseGithubUrl = require('parse-github-url')
const semver = require('semver')
const versionUtil = require('../version-util')
const { print } = require('../logging')

/** Gets remote versions sorted. */
const getSortedVersions = async (name, declaration, options) => {
  const { auth, protocol, host, path } = parseGithubUrl(declaration)
  const url = `${protocol ? protocol.replace('git+', '') : 'https:'}//${auth ? auth + '@' : ''}${host}/${path}`
  let tagMap = new Map()

  // fetch remote tags
  try {
    tagMap = await remoteGitTags(url)
  }
  // catch a variety of errors that occur on invalid or private repos
  catch (e) {
    print(options, `Invalid, private repo, or no tags for ${name}: ${declaration}`, 'verbose')
    return null
  }

  // eslint-disable-next-line fp/no-mutating-methods
  const tags = [...tagMap.keys()]
    .map(tag => versionUtil.isSimpleVersion(tag) ? tag + '.0.0' : tag)
    // do not pass semver.valid reference directly since the mapping index will be interpreted as the loose option
    // https://github.com/npm/node-semver#functions
    .filter(tag => semver.valid(tag))
    .sort(versionUtil.compareVersions)

  return tags
}

/** Return the highest non-prerelease numbered tag on a remote Git URL. */
const latest = async (name, declaration, options) => {
  const versions = await getSortedVersions(name, declaration, options)
  if (!versions) return null
  const versionsFiltered = options.pre
    ? versions
    : versions.filter(v => !versionUtil.isPre(v))
  const latestVersion = versionsFiltered[versionsFiltered.length - 1]
  return latestVersion
    ? versionUtil.upgradeGithubUrl(declaration, latestVersion)
    : null
}

/** Return the highest numbered tag on a remote Git URL. */
const greatest = async (name, declaration, options) => {
  const versions = await getSortedVersions(name, declaration, options)
  if (!versions) return null
  const greatestVersion = versions[versions.length - 1]
  return greatestVersion
    ? versionUtil.upgradeGithubUrl(declaration, greatestVersion)
    : null
}

/** Returns a function that returns the highest version at the given level. */
const greatestLevel = level => async (name, declaration, options = {}) => {

  const version = decodeURIComponent(parseGithubUrl(declaration).branch)
    .replace(/^semver:/, '')
  const versions = await getSortedVersions(name, declaration, options)
  if (!versions) return null

  const greatestMinor = versionUtil.findGreatestByLevel(
    versions.map(v => v.replace(/^v/, '')),
    version,
    level
  )

  return greatestMinor
    ? versionUtil.upgradeGithubUrl(declaration, greatestMinor)
    : null
}

module.exports = {
  greatest,
  minor: greatestLevel('minor'),
  latest,
  // use greatest for newest rather than leaving newest undefined
  // this allows a mix of npm and github urls to be used in a package file without causing an "Unsupported target" error
  newest: greatest,
  patch: greatestLevel('patch'),
}
