/** Fetches package metadata from Github tags. */

const remoteGitTags = require('remote-git-tags')
const parseGithubUrl = require('parse-github-url')
const semver = require('semver')
const versionUtil = require('../version-util')
const { print } = require('../logging')

/** Gets remote versions sorted. */
const getSortedVersions = async (name, version, options) => {
  const { auth, protocol, host, path } = parseGithubUrl(version)
  const url = `${protocol ? protocol.replace('git+', '') : 'https:'}//${auth ? auth + '@' : ''}${host}/${path}`
  let tagMap = new Map()

  // fetch remote tags
  try {
    tagMap = await remoteGitTags(url)
  }
  // catch a variety of errors that occur on invalid or private repos
  catch (e) {
    print(options, `Invalid, private repo, or no tags for ${name}: ${version}`, 'verbose')
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
const latest = async (name, version, options) => {
  const versions = await getSortedVersions(name, version, options)
  if (!versions) return null
  const versionsFiltered = options.pre
    ? versions
    : versions.filter(v => !versionUtil.isPre(v))
  const latestVersion = versionsFiltered[versionsFiltered.length - 1]
  return latestVersion
    ? versionUtil.upgradeGithubUrl(version, latestVersion)
    : null
}


/** Return the highest numbered tag on a remote Git URL. */
const greatest = async (name, version, options) => {
  const versions = await getSortedVersions(name, version, options)
  if (!versions) return null
  const greatestVersion = versions[versions.length - 1]
  return greatestVersion
    ? versionUtil.upgradeGithubUrl(version, greatestVersion)
    : null
}

module.exports = {
  greatest,
  latest,
}
