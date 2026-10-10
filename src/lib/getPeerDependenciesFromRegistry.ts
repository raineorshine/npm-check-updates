import pMap from 'p-map'
import semver from 'semver'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import getPackageManager from './getPackageManager.ts'
import isPackageManagerProtocol from './isPackageManagerProtocol.ts'
import { createProgressBar, errorText, print } from './logging.ts'
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
 * @param [dependencies] The project's own dependencies. When given, peers that are not among them are followed transitively, since the package manager installs them and their peer requirements constrain the project too.
 * @returns Promised {packageName: peer dependencies} collection
 */
async function getPeerDependenciesFromRegistry(
  packageMap: Index<Version>,
  options: Options,
  dependencies?: Index<Version>,
) {
  const packageManager = getPackageManager(options, options.packageManager)
  if (!packageManager.getPeerDependencies) return {}

  const bar = createProgressBar(options, Object.keys(packageMap).length)

  const packageEntries = Object.entries(packageMap)
  const failed: string[] = []

  /**
   * Fetches peer dependencies for a package.
   * @param pkg - The package name
   * @param version - The package version
   * @param tick - Whether to advance the progress bar, which only counts the packages passed in
   * @returns Promise that resolves to package name and its peer dependencies
   */
  const getPeerDepsForPackage = async (
    [pkg, version]: [string, Version],
    tick = true,
  ): Promise<{
    pkg: string
    version: Version
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
        print(options, `\nFailed to get the peer dependencies of ${pkg}@${version}:\n${errorText(err)}`, 'verbose')
        dependencies = {}
      }
    }
    if (bar && tick) {
      bar.tick()
    }
    return { pkg, version, dependencies }
  }

  const results = await pMap(packageEntries, entry => getPeerDepsForPackage(entry), {
    concurrency: options.concurrency,
  })

  // a required peer the project does not list is installed by the package manager at the highest version in range, so its own peers apply too
  if (dependencies) {
    const fetched = new Set([...Object.keys(packageMap), ...Object.keys(dependencies)])

    /** Fetches the peers a package marks as optional, which are not installed unless something else requires them. Only looked up when the package has an unlisted peer to follow. */
    const getOptionalPeers = async ({ pkg, version, dependencies: peers }: (typeof results)[number]) => {
      if (!packageManager.getOptionalPeerDependencies || Object.keys(peers).every(peer => fetched.has(peer))) return []
      try {
        return await packageManager.getOptionalPeerDependencies(pkg, version, options)
      } catch (err) {
        // following an optional peer only makes the check stricter, so a failed lookup is not worth a warning
        print(
          options,
          `\nFailed to get the optional peer dependencies of ${pkg}@${version}:\n${errorText(err)}`,
          'verbose',
        )
        return []
      }
    }

    let frontier = results
    while (frontier.length > 0) {
      const optionalPeers = await pMap(frontier, getOptionalPeers, { concurrency: options.concurrency })
      const transitive = new Map<string, Version>()
      frontier.forEach(({ dependencies: peers }, i) => {
        for (const [peer, spec] of Object.entries(peers)) {
          if (!fetched.has(peer) && !optionalPeers[i].includes(peer) && semver.validRange(spec)) {
            fetched.add(peer)
            transitive.set(peer, spec)
          }
        }
      })
      frontier = await pMap(transitive, entry => getPeerDepsForPackage(entry, false), {
        concurrency: options.concurrency,
      })
      results.push(...frontier)
    }
  }

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
