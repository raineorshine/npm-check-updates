'use strict'

const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const hostedGitInfo = require('hosted-git-info')

// extract the defaultBranchPath so it can be stripped in the final output
const defaultBranchPath = hostedGitInfo.fromUrl('user/repo').browse('').match(/(\/tree\/[a-z]+)/)[0]
const regexDefaultBranchPath = new RegExp(`${defaultBranchPath}$`)

/** Gets the repo url of an installed package. */
function getPackageRepo(packageName) {
  let nodeModulePaths = require.resolve.paths(packageName)
  const localNodeModules = path.join(process.cwd(), 'node_modules')
  nodeModulePaths = [localNodeModules].concat(nodeModulePaths)
  for (const basePath of nodeModulePaths) { // eslint-disable-line fp/no-loops
    const packageJsonPath = path.join(basePath, packageName, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        return packageJson.repository
      }
      catch (e) {}
    }
  }

  return null
}

/** Remove the default branch path from a git url. */
const cleanRepoUrl = url =>
  url.replace(/\/$/, '').replace(regexDefaultBranchPath, '')

/**
 * @param packageName A package name as listed in package.json's dependencies list
 * @param packageJson Optional param to specify a object representation of a package.json file instead of loading from node_modules
 * @returns A valid url to the root of the package's source or null if a url could not be determined
 */
function getRepoUrl(packageName, packageJson = undefined) {

  const repositoryMetadata =
    !packageJson ? getPackageRepo(packageName)
    : packageJson.repository ? packageJson.repository
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
    }
    catch (e) {}
  }
  else if (typeof repositoryMetadata.url === 'string') {
    gitURL = repositoryMetadata.url
    if (typeof repositoryMetadata.directory === 'string') {
      directory = repositoryMetadata.directory
    }
  }

  return typeof gitURL === 'string' && typeof directory === 'string'
    ? cleanRepoUrl(hostedGitInfo.fromUrl(gitURL).browse(directory))
    : null
}

module.exports = {
  getRepoUrl
}
