import { Index } from '../types/IndexType'

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
export function isCircularPeer(peerDependencies: Index<Index<string>>, packageName: string): CircularData {
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
