'use strict'

const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const hostedGitInfo = require('hosted-git-info')

/**
 * @param packageName A package name as listed in package.json's dependencies list
 * @param packageJson Optional param to specify a object representation of a package.json file instead of loading from node_modules
 * @returns A valid url to the root of the package's source or null if a url could not be determined
 */
function getRepoUrl(packageName, packageJson = undefined) {
  if (packageJson === undefined) {
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
      if (packageJson === undefined) {
        return null
      }
    }
    catch (e) {
      return null
    }
  }
  // The repository field may not exist
  if (packageJson.repository === undefined) {
    return null
  }
  let gitURL
  let directory = ''
  // It may be a string instead of an object
  if (typeof packageJson.repository === 'string') {
    gitURL = packageJson.repository
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
  else if (typeof packageJson.repository.url === 'string') {
    gitURL = packageJson.repository.url
    if (typeof packageJson.repository.directory === 'string') {
      directory = packageJson.repository.directory
    }
  }
  if (typeof gitURL === 'string' && typeof directory === 'string') {
    return hostedGitInfo.fromUrl(gitURL).browse(directory).replace(/\/$/, '')
  }
  return null
}

module.exports = {
  getRepoUrl,
}
