'use strict'

const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const hostedGitInfo = require('hosted-git-info')

const commonBranchPath = hostedGitInfo.fromUrl('user/repo').browse('').match(/(\/tree\/[a-z]+)/)[0]

/**
 * @param packageName A package name as listed in package.json's dependencies list
 * @param packageJson Optional param to specify a object representation of a package.json file instead of loading from node_modules
 * @returns A valid url to the root of the package's source or null if a url could not be determined
 */
function getRepoUrl(packageName, packageJson = undefined) {
  let repositoryMetadata
  if (!packageJson) {
    repositoryMetadata = getPackageRepo(packageName)
  }
  else if (packageJson.repository) {
    repositoryMetadata = packageJson.repository
  }
  if (!repositoryMetadata) {
    return null
  }
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
  if (typeof gitURL === 'string' && typeof directory === 'string') {
    return cleanRepoUrl(hostedGitInfo.fromUrl(gitURL).browse(directory))
  }
  return null
}

function getPackageRepo (packageName) {
  let packageJson
  try {
    const nodeModulePaths = require.resolve.paths(packageName)
    for (const basePath of nodeModulePaths) { // eslint-disable-line fp/no-loops
      const packageJsonPath = path.join(basePath, packageName, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        break
      }
    }
    // The package.json file cannot be found
    if (!packageJson) {
      return null
    }
  }
  catch (e) {
    return null
  }
  // The repository field may not exist
  if (!packageJson.repository) {
    return null
  }
  return packageJson.repository
}

function cleanRepoUrl (url) {
  return url.replace(/\/$/, '').replace(new RegExp(`${commonBranchPath}$`), '')
}

module.exports = {
  getRepoUrl
}
