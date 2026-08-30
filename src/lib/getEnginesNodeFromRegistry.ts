import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getPackageManager from './getPackageManager.ts'
import { createProgressBar } from './logging.ts'

/**
 * Get the engines.node versions from the npm repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are version
 * @param [options={}] Options.
 * @returns Promised {packageName: engines.node} collection
 */
async function getEnginesNodeFromRegistry(packageMap: Index<Version>, options: Options) {
  const packageManager = getPackageManager(options, options.packageManager)
  if (!packageManager.getEngines) return {}

  const bar = createProgressBar(options, Object.keys(packageMap).length)

  const result: Index<VersionSpec | undefined> = {}
  for (const [pkg, version] of Object.entries(packageMap)) {
    const enginesNode = (await packageManager.getEngines!(pkg, version, options)).node
    if (bar) bar.tick()
    result[pkg] = enginesNode
  }
  return result
}

export default getEnginesNodeFromRegistry
