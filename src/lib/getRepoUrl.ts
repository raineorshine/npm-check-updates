import fs from 'fs/promises'
import hostedGitInfo from 'hosted-git-info'
import path from 'path'
import { URL } from 'url'
import { PackageFile } from '../types/PackageFile'
import { PackageFileRepository } from '../types/PackageFileRepository'
import exists from './exists'

// extract the defaultBranchPath so it can be stripped in the final output
const defaultBranchPath = hostedGitInfo
  .fromUrl('user/repo')
  ?.browse('')
  .match(/(\/tree\/[a-z]+)/)?.[0]
const regexDefaultBranchPath = new RegExp(`${defaultBranchPath}$`)

/** Gets the repo url of an installed package. */
async function getPackageRepo(
  packageName: string,
  {
    pkgFile,
  }: {
    /** Specify the package file location to add to the node_modules search paths. Needed in workspaces/deep mode. */
    pkgFile?: string
  } = {},
): Promise<string | { url: string } | null> {
  const requirePaths = require.resolve.paths(packageName) || []
  const pkgFileNodeModules = pkgFile ? [path.join(path.dirname(pkgFile), 'node_modules')] : []
  const localNodeModules = [path.join(process.cwd(), 'node_modules')]
  const nodeModulePaths = [...pkgFileNodeModules, ...localNodeModules, ...requirePaths]

  for (const basePath of nodeModulePaths) {
    const packageJsonPath = path.join(basePath, packageName, 'package.json')
    if (await exists(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
        return packageJson.repository
      } catch (e) {}
    }
  }

  return null
}

/** Remove the default branch path from a git url. */
const cleanRepoUrl = (url: string) => url.replace(/\/$/, '').replace(regexDefaultBranchPath, '')

/**
 * @param packageName A package name as listed in package.json's dependencies list
 * @param packageJson Optional param to specify a object representation of a package.json file instead of loading from node_modules
 * @returns A valid url to the root of the package's source or null if a url could not be determined
 */
async function getRepoUrl(
  packageName: string,
  packageJson?: PackageFile,
  {
    pkgFile,
  }: {
    /** See: getPackageRepo pkgFile param. */
    pkgFile?: string
  } = {},
) {
  const repositoryMetadata: string | PackageFileRepository | null = !packageJson
    ? await getPackageRepo(packageName, { pkgFile })
    : packageJson.repository
      ? packageJson.repository
      : null

  if (!repositoryMetadata) return null

  let gitURL
  let directory = ''

  // It may be a string instead of an object
  if (typeof repositoryMetadata === 'string') {
    gitURL = repositoryMetadata
    try {
      // It may already be a valid Repo URL
      const url = new URL(gitURL)
      // Some packages put a full URL in this field although it's not spec compliant. Let's detect that and use it if present
      if (['github.com', 'gitlab.com', 'bitbucket.org'].includes(url.hostname) && url.protocol === 'https:') {
        return gitURL
      }
    } catch (e) {}
  } else if (typeof repositoryMetadata.url === 'string') {
    gitURL = repositoryMetadata.url
    if (typeof repositoryMetadata.directory === 'string') {
      directory = repositoryMetadata.directory
    }
  }

  if (typeof gitURL === 'string' && typeof directory === 'string') {
    const hostedGitURL = hostedGitInfo.fromUrl(gitURL)?.browse(directory)
    if (hostedGitURL !== undefined) {
      return cleanRepoUrl(hostedGitURL)
    }
  }
  return null
}

export default getRepoUrl
