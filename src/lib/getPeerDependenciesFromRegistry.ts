import pMap from 'p-map'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import getPackageManager from './getPackageManager.ts'
import isPackageManagerProtocol from './isPackageManagerProtocol.ts'
import { createProgressBar, print } from './logging.ts'
import resolveDistTagsInPeerDependencies from './resolveDistTagsInPeerDependencies.ts'
import { isGitHubUrl, isWildcard } from './version-util.ts'

type CircularData =
  | {
      isCircular: true
      offendingPackage: string
    }
  | {
      isCircular: false
    }

/**
 * Checks if the specified package will create a loop of peer dependencies by traversing all paths to find a cycle.
 *
 * If a cycle was found, the offending peer dependency of the specified package is returned.
 */
function isCircularPeer(peerDependencies: Index<Index<string>>, packageName: string): CircularData {
  const visited = new Set<string>()
  let queue = [[packageName]]
  while (queue.length > 0) {
    const nextQueue: string[][] = []
    for (const path of queue) {
      const head = path[0]
      if (visited.has(head)) continue
      visited.add(head)
      const parents = Object.keys(peerDependencies[head] ?? {})
      for (const name of parents) {
        if (name === path.at(-1)) {
          return {
            isCircular: true,
            offendingPackage: head,
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
 * Get the latest or greatest versions from the npm repository based on the version target.
 *
 * @param packageMap   An object whose keys are package name and values are version
 * @param [options={}] Options.
 * @returns Promised {packageName: peer dependencies} collection
 */
async function getPeerDependenciesFromRegistry(packageMap: Index<Version>, options: Options) {
  const packageManager = getPackageManager(options, options.packageManager)
  if (!packageManager.getPeerDependencies) return {}

  const bar = createProgressBar(options, Object.keys(packageMap).length)

  const packageEntries = Object.entries(packageMap)
  const failed: string[] = []

  /**
   * Fetches peer dependencies for a package.
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
    } else if (!version || isPackageManagerProtocol(version) || isGitHubUrl(version) || isWildcard(version)) {
      // the registry has nothing to look up for these, so do not report them as unfetchable
      dependencies = {}
    } else {
      try {
        dependencies = await packageManager.getPeerDependencies!(pkg, version, options)
        options.cacher?.setPeers(pkg, version, dependencies)
      } catch (err) {
        // one unreachable package should not abort the run
        failed.push(pkg)
        print(
          options,
          `\nFailed to get the peer dependencies of ${pkg}@${version}:\n${err instanceof Error ? err.message : err}`,
          'verbose',
        )
        dependencies = {}
      }
    }
    if (bar) {
      bar.tick()
    }
    return { pkg, dependencies }
  }

  const results = await pMap(packageEntries, getPeerDepsForPackage, { concurrency: options.concurrency })

  const peerDepsMap: Index<Index<string>> = {}
  for (const { pkg, dependencies } of results) {
    peerDepsMap[pkg] = dependencies
    const circularData = isCircularPeer(peerDepsMap, pkg)
    if (circularData.isCircular) {
      delete peerDepsMap[pkg][circularData.offendingPackage]
    }
  }

  // peer deps are fetched several times per run, so only report each package once
  const reported = (options.peerDependenciesFailed ??= new Set())
  const unreported = failed.filter(pkg => !reported.has(pkg))
  if (unreported.length > 0) {
    for (const pkg of unreported) {
      reported.add(pkg)
    }
    const preview = unreported.slice(0, 5).join(', ')
    const more = unreported.length > 5 ? ` (and ${unreported.length - 5} more)` : ''
    print(
      options,
      `\nCould not determine the peer dependencies of ${preview}${more}. Incompatible updates of these packages will not be ignored. Run with --verbose for details.`,
      'warn',
    )
  }

  await options.cacher?.save()
  options.cacher?.log(true)

  // outside the cache so dist-tags are re-resolved every run
  return resolveDistTagsInPeerDependencies(peerDepsMap, options)
}

export default getPeerDependenciesFromRegistry
