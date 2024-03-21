import ProgressBar from 'progress'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { VersionSpec } from '../types/VersionSpec'
import getPackageManager from './getPackageManager'
import { isCircularPeer } from './isCircularPeer'

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are version
 * @param [options={}] Options.
 * @returns Promised {packageName: peer dependencies} collection
 */
async function getPeerDependenciesFromRegistry(packageMap: Index<VersionSpec>, options: Options) {
  const packageManager = getPackageManager(options, options.packageManager)
  if (!packageManager.getPeerDependencies) return {}

  const numItems = Object.keys(packageMap).length
  let bar: ProgressBar
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && numItems > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: numItems, width: 20 })
    bar.render()
  }

  const peerDependencies: Index<Index<string>> = Object.entries(packageMap).reduce(
    async (accumPromise, [pkg, version]) => {
      const dep = await packageManager.getPeerDependencies!(pkg, version)
      if (bar) {
        bar.tick()
      }
      const accum = await accumPromise
      const newAcc: Index<Index<string>> = { ...accum, [pkg]: dep }
      const circularData = isCircularPeer(newAcc, pkg)
      if (circularData.isCircular) {
        delete newAcc[pkg][circularData.offendingPackage]
      }
      return newAcc
    },
    {},
  )
  return peerDependencies
}

export default getPeerDependenciesFromRegistry
