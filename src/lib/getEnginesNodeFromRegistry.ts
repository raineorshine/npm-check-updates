import ProgressBar from 'progress'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getPackageManager from './getPackageManager.ts'
import { shouldShowProgressBar } from './logging.ts'

/**
 * Get the engines.node versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are version
 * @param [options={}] Options.
 * @returns Promised {packageName: engines.node} collection
 */
async function getEnginesNodeFromRegistry(packageMap: Index<Version>, options: Options) {
  const packageManager = getPackageManager(options, options.packageManager)
  if (!packageManager.getEngines) return {}

  const numItems = Object.keys(packageMap).length
  let bar: ProgressBar | undefined
  if (shouldShowProgressBar(options, numItems)) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: numItems, width: 20 })
    bar.render()
  }

  const result: Index<VersionSpec | undefined> = {}
  for (const [pkg, version] of Object.entries(packageMap)) {
    const engines = await packageManager.getEngines!(pkg, version, options)
    const enginesNode = engines.node
    if (bar) bar.tick()
    result[pkg] = enginesNode
  }
  return result
}

export default getEnginesNodeFromRegistry
