import { JSR_NPM_SCOPE, JSR_REGISTRY } from '../lib/version-util.ts'
import { type GetVersion } from '../types/GetVersion.ts'
import { type NpmConfig } from '../types/NpmConfig.ts'
import * as npm from './npm.ts'

const npmConfigJsr: NpmConfig = { [`${JSR_NPM_SCOPE}:registry`]: JSR_REGISTRY }

/**
 * Wraps a GetVersion function and passes JSR's registry for the @jsr scope.
 *
 * Passed in the npmConfigWorkspaceProject slot, the lowest precedence layer, so a @jsr:registry in any npmrc
 * still wins and JSR mirrors keep working.
 */
const withJsrRegistry =
  (getVersion: GetVersion): GetVersion =>
  (packageName, currentVersion, options = {}) =>
    getVersion(packageName, currentVersion, options, undefined, npmConfigJsr)

export const distTag = withJsrRegistry(npm.distTag)
export const greatest = withJsrRegistry(npm.greatest)
export const latest = withJsrRegistry(npm.latest)
export const minor = withJsrRegistry(npm.minor)
export const newest = withJsrRegistry(npm.newest)
export const patch = withJsrRegistry(npm.patch)
export const semver = withJsrRegistry(npm.semver)
