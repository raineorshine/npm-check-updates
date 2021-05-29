import { Index, Options, VersionSpec } from '../types'
import getPackageManager from './getPackageManager'
import ProgressBar from 'progress'

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are version
 * @param [options={}] Options.
 * @returns Promised {packageName: peer dependencies} collection
 */
async function getPeerDependenciesFromRegistry(packageMap: Index<VersionSpec>, options: Options) {
  const packageManager = getPackageManager(options.packageManager)
  if (!packageManager.getPeerDependencies) return {}

  const numItems = Object.keys(packageMap).length
  let bar: ProgressBar
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && numItems > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: numItems, width: 20 })
    bar.render()
  }

  return Object.entries(packageMap).reduce(async (accumPromise, [pkg, version]) => {
    const dep = await packageManager.getPeerDependencies!(pkg, version)
    if (bar) {
      bar.tick()
    }
    const accum = await accumPromise
    return { ...accum, [pkg]: dep }
  }, {})
}

export default getPeerDependenciesFromRegistry
