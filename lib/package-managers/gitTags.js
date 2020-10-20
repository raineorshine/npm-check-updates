/** Fetches package metadata from Github tags. */

const remoteGitTags = require('remote-git-tags')
const parseGithubUrl = require('parse-github-url')
const semver = require('semver')
const versionUtil = require('../version-util')
const { print } = require('../logging')

/** Return the highest numbered tag on a remote Git URL. */
const greatest = async (name, version, options) => {
  const { protocol, host, path } = parseGithubUrl(version)
  const url = `${protocol ? protocol.replace('git+', '') : 'https:'}//${host}/${path}`
  let tagMap = new Map()

  // fetch remote tags
  try {
    tagMap = await remoteGitTags(url)
  }
  // catch a variety of errors that occur on invalid or private repos
  catch (e) {
    print(options, `Invalid or Private repo ${name}: ${version}`, 'verbose')
    return null
  }

  // eslint-disable-next-line fp/no-mutating-methods
  const tags = [...tagMap.keys()]
    .filter(semver.valid)
    .sort(versionUtil.compareVersions)
  const latestVersion = tags[tags.length - 1]
  return versionUtil.upgradeGithubUrl(version, latestVersion)
}

module.exports = {
  greatest,
}
