import pMap from 'p-map'
import ProgressBar from 'progress'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import getPackageManager from './getPackageManager'
import keyValueBy from './keyValueBy'

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

  const packageList = Object.keys(packageMap)
  const numItems = packageList.length
  let bar: ProgressBar
  if (!options.json && options.loglevel !== 'silent' && options.loglevel !== 'verbose' && numItems > 0) {
    bar = new ProgressBar('[:bar] :current/:total :percent', { total: numItems, width: 20 })
    bar.render()
  }

  const peerDepsList = await pMap(
    packageList,
    async (pkg: string) => {
      const version = packageMap[pkg]
      const dep = await packageManager.getPeerDependencies!(pkg, version)
      bar?.tick()
      return {
        [pkg]: dep,
      }
    },
    { concurrency: options.concurrency },
  )

  const result = keyValueBy(peerDepsList, item => item)

  // check for circular dependencies
  for (const pkg of Object.keys(result)) {
    const circularData = isCircularPeer(result, pkg)
    if (circularData.isCircular) {
      delete result[pkg][circularData.offendingPackage]
    }
  }

  return result
}

export default getPeerDependenciesFromRegistry
