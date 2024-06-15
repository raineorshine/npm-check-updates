import ProgressBar from 'progress'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import getPackageManager from './getPackageManager'

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
  let bar: ProgressBar
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && numItems > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: numItems, width: 20 })
    bar.render()
  }

  return Object.entries(packageMap).reduce(async (accumPromise, [pkg, version]) => {
    const enginesNode = (await packageManager.getEngines!(pkg, version, options)).node
    if (bar) {
      bar.tick()
    }
    const accum = await accumPromise
    return { ...accum, [pkg]: enginesNode }
  }, Promise.resolve<Index<Version | undefined>>({}))
}

export default getEnginesNodeFromRegistry
