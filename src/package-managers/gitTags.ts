/** Fetches package metadata from Github tags. */

import remoteGitTags from 'remote-git-tags'
import parseGithubUrl from 'parse-github-url'
import semver from 'semver'
import * as versionUtil from '../version-util'
import { print } from '../logging'
import { Options, VersionSpec, VersionLevel } from '../types'

/** Gets remote versions sorted. */
const getSortedVersions = async (name: string, declaration: VersionSpec, options: Options) => {
  // if present, github: is parsed as the protocol. This is not valid when passed into remote-git-tags.
  declaration = declaration.replace(/^github:/, '')
  const { auth, protocol, host, path } = parseGithubUrl(declaration)!
  let tagMap = new Map()
  let tagsPromise = Promise.resolve(tagMap)
  const protocolKnown = protocol != null
  if (protocolKnown) {
    tagsPromise = tagsPromise.then(() => remoteGitTags(`${protocol ? protocol.replace('git+', '') : 'https:'}//${auth ? auth + '@' : ''}${host}/${path}`))
  }
  else {
    // try ssh first, then https on failure
    tagsPromise = tagsPromise.then(() => remoteGitTags(`ssh://git@${host}/${path}`))
      .catch(() => remoteGitTags(`https://${auth ? auth + '@' : ''}${host}/${path}`))
  }

  // fetch remote tags
  try {
    tagMap = await tagsPromise
  }
  // catch a variety of errors that occur on invalid or private repos
  catch (e) {
    print(options, `Invalid, private repo, or no tags for ${name}: ${declaration}`, 'verbose')
    return null
  }

  // eslint-disable-next-line fp/no-mutating-methods
  const tags = Array.from(tagMap.keys())
    .map(versionUtil.fixPseudoVersion)
    // do not pass semver.valid reference directly since the mapping index will be interpreted as the loose option
    // https://github.com/npm/node-semver#functions
    .filter(tag => semver.valid(tag))
    .sort(versionUtil.compareVersions)

  return tags
}

/** Return the highest non-prerelease numbered tag on a remote Git URL. */
export const latest = async (name: string, declaration: VersionSpec, options: Options) => {
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
export const greatest = async (name: string, declaration: VersionSpec, options: Options) => {
  const versions = await getSortedVersions(name, declaration, options)
  if (!versions) return null
  const greatestVersion = versions[versions.length - 1]
  return greatestVersion
    ? versionUtil.upgradeGithubUrl(declaration, greatestVersion)
    : null
}

/** Returns a function that returns the highest version at the given level. */
export const greatestLevel = (level: VersionLevel) => async (name: string, declaration: VersionSpec, options: Options = {}) => {

  const version = decodeURIComponent(parseGithubUrl(declaration)!.branch)
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

export const minor = greatestLevel('minor')
export const patch = greatestLevel('patch')

// use greatest for newest rather than leaving newest undefined
// this allows a mix of npm and github urls to be used in a package file without causing an "Unsupported target" error
export const newest = greatest
