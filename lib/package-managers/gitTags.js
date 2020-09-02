/** Fetches package metadata from Github tags. */

const remoteGitTags = require('remote-git-tags')
const parseGithubUrl = require('parse-github-url')
const versionUtil = require('../version-util')
const { print } = require('../logging')

/** Return the highest numbered tag on a remote Git URL. */
const greatest = async (name, version, options) => {
  const { protocol, host, path } = parseGithubUrl(version)
  const url = `${protocol || 'https:'}//${host}/${path}`
  let tagMap = new Map()

  // fetch remote tags
  try {
    tagMap = await remoteGitTags(url)
  }
  // catch a variety of errors that occur on invalid or private repos
  catch (e) {
    print(options, `Invalid or Private repo ${name}: ${version}`, 'verbose')
    if (/Repository not found|Could not read from remote repository.|Permission denied|not a git command|unable to find remote helper/i.test(e.stderr)) {
      return null
    }
    else {
      throw e
    }
  }

  // eslint-disable-next-line fp/no-mutating-methods
  const tagsSorted = [...tagMap.keys()].sort(versionUtil.compareVersions)
  const latestVersion = tagsSorted[tagsSorted.length - 1]
  return versionUtil.upgradeGithubUrl(version, latestVersion)
}

module.exports = {
  greatest,
}
