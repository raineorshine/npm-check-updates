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

  /**
   * Fetches peer dependencies for a package
   * @param pkg - The package name
   * @param version - The package version
   * @returns Promise that resolves to package name and its peer dependencies
   */
  const getPeerDepsForPackage = async ([pkg, version]: [string, Version]): Promise<{
    pkg: string
    dependencies: Index<string>
  }> => {
    let dependencies: Index<string>
    const cached = options.cacher?.getPeers(pkg, version)
    if (cached) {
      dependencies = cached
    } else {
      dependencies = await packageManager.getPeerDependencies!(pkg, version, { cwd: options.cwd })
      options.cacher?.setPeers(pkg, version, dependencies)
    }
    if (bar) {
      bar.tick()
    }
    return { pkg, dependencies }
  }

  const results = await pMap(packageEntries, getPeerDepsForPackage, { concurrency: options.concurrency })

  const accum: Index<Index<string>> = {}
  for (const { pkg, dependencies } of results) {
    accum[pkg] = dependencies
    const circularData = isCircularPeer(accum, pkg)
    if (circularData.isCircular) {
      delete accum[pkg][circularData.offendingPackage]
    }
  }

  await options.cacher?.save()
  options.cacher?.log(true)

  return accum
}

export default getPeerDependenciesFromRegistry
