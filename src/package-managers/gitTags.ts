/** Fetches package metadata from Github tags. */
import parseGithubUrl from 'parse-github-url'
import remoteGitTags from 'remote-git-tags'
import { valid } from 'semver'
import { print } from '../lib/logging'
import * as versionUtil from '../lib/version-util'
import { GetVersion } from '../types/GetVersion'
import { Options } from '../types/Options'
import { VersionLevel } from '../types/VersionLevel'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'

/** Gets remote versions sorted. */
const getSortedVersions = async (name: string, declaration: VersionSpec, options?: Options) => {
  // if present, github: is parsed as the protocol. This is not valid when passed into remote-git-tags.
  declaration = declaration.replace(/^github:/, '')
  const { auth, protocol, host, path } = parseGithubUrl(declaration)!
  let tagMap = new Map()
  let tagsPromise = Promise.resolve(tagMap)
  const protocolKnown = protocol != null
  if (protocolKnown) {
    tagsPromise = tagsPromise.then(() =>
      remoteGitTags(
        `${protocol ? protocol.replace('git+', '') : 'https:'}//${auth ? auth + '@' : ''}${host}/${path?.replace(/^:/, '')}`,
      ),
    )
  } else {
    // try ssh first, then https on failure
    tagsPromise = tagsPromise
      .then(() => remoteGitTags(`ssh://git@${host}/${path?.replace(/^:/, '')}`))
      .catch(() => remoteGitTags(`https://${auth ? auth + '@' : ''}${host}/${path}`))
  }

  // fetch remote tags
  try {
    tagMap = await tagsPromise
  } catch (e) {
    // catch a variety of errors that occur on invalid or private repos
    print(options || {}, `Invalid, private repo, or no tags for ${name}: ${declaration}`, 'verbose')
    return null
  }

  const tags = Array.from(tagMap.keys())
    .map(versionUtil.fixPseudoVersion)
    // do not pass semver.valid reference directly since the mapping index will be interpreted as the loose option
    // https://github.com/npm/node-semver#functions
    .filter(tag => valid(tag))
    .sort(versionUtil.compareVersions)

  return tags
}

/** Return the highest non-prerelease numbered tag on a remote Git URL. */
export const latest: GetVersion = async (name: string, declaration: VersionSpec, options?: Options) => {
  const versions = await getSortedVersions(name, declaration, options)
  if (!versions) return { version: null }
  const versionsFiltered = options?.pre ? versions : versions.filter(v => !versionUtil.isPre(v))
  const latestVersion = versionsFiltered[versionsFiltered.length - 1]
  return { version: latestVersion ? versionUtil.upgradeGithubUrl(declaration, latestVersion) : null }
}

/** Return the highest numbered tag on a remote Git URL. */
export const greatest: GetVersion = async (name: string, declaration: VersionSpec, options?: Options) => {
  const versions = await getSortedVersions(name, declaration, options)
  if (!versions) return { version: null }
  const greatestVersion = versions[versions.length - 1]
  return { version: greatestVersion ? versionUtil.upgradeGithubUrl(declaration, greatestVersion) : null }
}

/** Returns a function that returns the highest version at the given level. */
export const greatestLevel =
  (level: VersionLevel) =>
  async (name: string, declaration: VersionSpec, options: Options = {}): Promise<VersionResult> => {
    const version = decodeURIComponent(parseGithubUrl(declaration)!.branch).replace(/^semver:/, '')
    const versions = await getSortedVersions(name, declaration, options)
    if (!versions) return { version: null }

    const greatestMinor = versionUtil.findGreatestByLevel(
      versions.map(v => v.replace(/^v/, '')),
      version,
      level,
    )

    return { version: greatestMinor ? versionUtil.upgradeGithubUrl(declaration, greatestMinor) : null }
  }

export const minor = greatestLevel('minor')
export const patch = greatestLevel('patch')

/** All git tags are exact versions, so --target semver should never upgrade git tags. */
// https://github.com/raineorshine/npm-check-updates/pull/1368
export const semver: GetVersion = async (_name: string, _declaration: VersionSpec, _options?: Options) => {
  return { version: null }
}

// use greatest for newest rather than leaving newest undefined
// this allows a mix of npm and github urls to be used in a package file without causing an "Unsupported target" error
export const newest = greatest
