import pMap from 'p-map'
import ProgressBar from 'progress'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import getPackageManager from './getPackageManager'

type CircularData =
  | {
      isCircular: true
      offendingPackage: string
    }
  | {
      isCircular: false
    }

/**
 * Checks if the specified package will create a loop of peer dependencies by traversing all paths to find a cycle
 *
 * If a cycle was found, the offending peer dependency of the specified package is returned
 */
function isCircularPeer(peerDependencies: Index<Index<string>>, packageName: string): CircularData {
  let queue = [[packageName]]
  while (queue.length > 0) {
    const nextQueue: string[][] = []
    for (const path of queue) {
      const parents = Object.keys(peerDependencies[path[0]] ?? {})
      for (const name of parents) {
        if (name === path.at(-1)) {
          return {
            isCircular: true,
            offendingPackage: path[0],
          }
        }
        nextQueue.push([name, ...path])
      }
    }
    queue = nextQueue
  }
  return {
    isCircular: false,
  }
}

/**
 * Get the latest or greatest versions from the NPM repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are version
 * @param [options={}] Options.
 * @returns Promised {packageName: peer dependencies} collection
 */
async function getPeerDependenciesFromRegistry(packageMap: Index<Version>, options: Options) {
  const packageManager = getPackageManager(options, options.packageManager)
  if (!packageManager.getPeerDependencies) return {}

  const numItems = Object.keys(packageMap).length
  let bar: ProgressBar
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && numItems > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: numItems, width: 20 })
    bar.render()
  }

  const packageEntries = Object.entries(packageMap)
  const accum: Index<Index<string>> = {}

  /**
   * Processes peer dependencies for a package and updates the accumulator
   * @param pkg - The package name
   * @param version - The package version
   * @returns Promise that resolves when peer dependencies are processed
   */
  const processPeerDependencies = async ([pkg, version]: [string, Version]) => {
    let dep: Index<string>
    const cached = options.cacher?.getPeers(pkg, version)
    if (cached) {
      dep = cached
    } else {
      dep = await packageManager.getPeerDependencies!(pkg, version, { cwd: options.cwd })
      options.cacher?.setPeers(pkg, version, dep)
    }
    if (bar) {
      bar.tick()
    }
    accum[pkg] = dep
    const circularData = isCircularPeer(accum, pkg)
    if (circularData.isCircular) {
      delete accum[pkg][circularData.offendingPackage]
    }
  }

  await pMap(packageEntries, processPeerDependencies, { concurrency: options.concurrency })

  await options.cacher?.save()
  options.cacher?.log(true)

  return accum
}

export default getPeerDependenciesFromRegistry
