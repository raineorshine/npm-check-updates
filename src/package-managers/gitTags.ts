/** Fetches package metadata from Github tags. */
import childProcess from 'node:child_process'
import { promisify } from 'node:util'
import parseGithubUrl from 'parse-github-url'
import { valid } from 'semver'
import { print } from '../lib/logging'
import * as versionUtil from '../lib/version-util'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { VersionLevel } from '../types/VersionLevel'
import { VersionResult } from '../types/VersionResult'
import { VersionSpec } from '../types/VersionSpec'

const execFile = promisify(childProcess.execFile)

/**
 * Fetches and extracts all git tags from a git url.
 *
 * @param url - url to a github repository.
 * @returns the extracted git tags.
 */
async function getGitTags(url: string): Promise<Index<string>> {
  const out = (await execFile('git', ['ls-remote', '--tags', url])).stdout
  const tags: Index<string> = {}
  for (const line of out.trim().split('\n')) {
    const splitted = line.split('\t')
    tags[splitted[1].replace(/^refs\/tags\/|\^{}$/g, '')] = splitted[0]
  }
  return tags
}

/** Gets remote versions sorted. */
async function getSortedVersions(
  name: string,
  declaration: VersionSpec,
  options?: Options,
): Promise<string[] | undefined> {
  // if present, github: is parsed as the protocol. This is not valid when passed into remote-git-tags.
  declaration = declaration.replace(/^github:/, '')
  const { auth, protocol, host, path } = parseGithubUrl(declaration)!
  let tags: Index<string>

  try {
    if (protocol !== null) {
      tags = await getGitTags(
        `${protocol ? protocol.replace('git+', '') : 'https:'}//${auth ? auth + '@' : ''}${host}/${path?.replace(/^:/, '')}`,
      )
    } else {
      try {
        tags = await getGitTags(`ssh://git@${host}/${path?.replace(/^:/, '')}`)
      } catch {
        tags = await getGitTags(`https://${auth ? auth + '@' : ''}${host}/${path}`)
      }
    }
  } catch (e) {
    // catch a variety of errors that occur on invalid or private repos
    print(options ?? {}, `Invalid, private repo, or no tags for ${name}: ${declaration}`, 'verbose')
    return
  }

  return Object.keys(tags)
    .map(versionUtil.fixPseudoVersion)
    .filter(tag => valid(tag))
    .sort(versionUtil.compareVersions)
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
