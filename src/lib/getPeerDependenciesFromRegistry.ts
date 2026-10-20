import pMap from 'p-map'
import semver from 'semver'
import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type Version } from '../types/Version.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'
import getPackageManager from './getPackageManager.ts'
import isPackageManagerProtocol from './isPackageManagerProtocol.ts'
import { createProgressBar, errorText, print } from './logging.ts'
import { PEER_PATH_SEPARATOR } from './peerPaths.ts'
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
 * @param [listed] Every package the project lists. When given, required peers that are not among them are followed transitively, since the package manager installs them and their peer requirements constrain the project too. Their peers are keyed by path from the package that brings them in, e.g. "wick-a11y > cypress-axe".
 * @returns Promised {packageName: peer dependencies} collection
 */
async function getPeerDependenciesFromRegistry(
  packageMap: Index<Version>,
  options: Options,
  listed?: Iterable<string>,
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
   * @param transitive - Whether the package is an unlisted peer, whose version is the range it is required at
   * @returns Promise that resolves to package name and its peer dependencies
   */
  const getPeerDepsForPackage = async (
    [pkg, version]: [string, Version],
    transitive = false,
  ): Promise<{
    pkg: string
    version: Version
    dependencies: Index<string>
  }> => {
    let dependencies: Index<string>
    // a range resolves to whatever is newest when it is looked up, so only exact versions are cached
    const cacheable = !transitive || !!semver.valid(version)
    const cached = cacheable ? options.cacher?.getPeers(pkg, version) : undefined
    if (cached) {
      dependencies = cached
    } else if (
      !version ||
      isPackageManagerProtocol(version) ||
      isGitHubUrl(version) ||
      // an unlisted peer required at any version is installed at the latest, so it is still looked up
      (!transitive && isWildcard(version))
    ) {
      // the registry has nothing to look up for these, so do not report them as unfetchable
      dependencies = {}
    } else {
      try {
        dependencies = await packageManager.getPeerDependencies!(pkg, version, options)
        if (cacheable) {
          options.cacher?.setPeers(pkg, version, dependencies)
        }
      } catch (err) {
        // one unreachable package should not abort the run. An unlisted peer is not upgraded, so it is only logged.
        if (!transitive) failed.push(pkg)
        print(options, `\nFailed to get the peer dependencies of ${pkg}@${version}:\n${errorText(err)}`, 'verbose')
        dependencies = {}
      }
    }
    if (bar && !transitive) {
      bar.tick()
    }
    return { pkg, version, dependencies }
  }

  const results = await pMap(packageEntries, entry => getPeerDepsForPackage(entry), {
    concurrency: options.concurrency,
  })

  const peerDepsMap: Index<Index<string>> = {}
  for (const { pkg, dependencies } of results) {
    peerDepsMap[pkg] = dependencies
    const circularData = isCircularPeer(peerDepsMap, pkg)
    if (circularData.isCircular) {
      delete peerDepsMap[pkg][circularData.offendingPackage]
    }
  }

  // a required peer the project does not list is installed by the package manager at the highest version in range, so its own peers apply too
  if (listed) {
    const listedNames = new Set(listed)

    // several packages often bring in the same unlisted peer, so each lookup is shared
    const lookups = new Map<string, ReturnType<typeof getPeerDepsForPackage>>()
    /** Fetches the peers of an unlisted peer at the range it is required at. */
    const lookup = (pkg: string, spec: VersionSpec) => {
      const key = `${pkg}@${spec}`
      if (!lookups.has(key)) lookups.set(key, getPeerDepsForPackage([pkg, spec], true))
      return lookups.get(key)!
    }
    const optionalLookups = new Map<string, Promise<string[]>>()

    /** Fetches the peers a package marks as optional, which are not installed unless something else requires them. */
    const getOptionalPeers = (pkg: string, version: Version) => {
      const key = `${pkg}@${version}`
      if (!optionalLookups.has(key)) {
        optionalLookups.set(
          key,
          (async () => {
            try {
              return (await packageManager.getOptionalPeerDependencies?.(pkg, version, options)) ?? []
            } catch (err) {
              // following an optional peer only makes the check stricter, so a failed lookup is not worth a warning
              print(
                options,
                `\nFailed to get the optional peer dependencies of ${pkg}@${version}:\n${errorText(err)}`,
                'verbose',
              )
              return []
            }
          })(),
        )
      }
      return optionalLookups.get(key)!
    }

    /** A package reached from a listed root, along with the version it was looked up at and its peers. */
    type Node = {
      root: string
      path: string
      chain: string[]
      pkg: string
      version: Version
      peers: Index<VersionSpec>
    }

    /** Returns whether a peer of the node is one to follow: unlisted, not already on its chain, and a range that resolves. */
    const isFollowable = (node: Node, peer: string, spec: VersionSpec) =>
      !listedNames.has(peer) && !node.chain.includes(peer) && !!semver.validRange(spec)

    // each root walks its own chain, so a peer required at several ranges is checked at each of them
    const seen = new Map<string, Set<string>>()
    let frontier: Node[] = results.map(({ pkg, version }) => ({
      root: pkg,
      path: pkg,
      chain: [pkg],
      pkg,
      version,
      peers: peerDepsMap[pkg],
    }))
    while (frontier.length > 0) {
      const optional = await pMap(
        frontier,
        node =>
          Object.entries(node.peers).some(([peer, spec]) => isFollowable(node, peer, spec))
            ? getOptionalPeers(node.pkg, node.version)
            : [],
        { concurrency: options.concurrency },
      )

      // a peer is installed if anything requires it, so one that is optional for one package may still be required by a sibling
      const required = new Set<string>()
      frontier.forEach((node, i) => {
        for (const [peer, spec] of Object.entries(node.peers)) {
          if (isFollowable(node, peer, spec) && !optional[i].includes(peer))
            required.add(`${node.root}${PEER_PATH_SEPARATOR}${peer}`)
        }
      })

      const next: { root: string; path: string; chain: string[]; pkg: string; spec: VersionSpec }[] = []
      for (const node of frontier) {
        const seenByRoot = seen.get(node.root) ?? seen.set(node.root, new Set()).get(node.root)!
        for (const [peer, spec] of Object.entries(node.peers)) {
          const key = `${peer}@${spec}`
          if (!isFollowable(node, peer, spec) || !required.has(`${node.root}${PEER_PATH_SEPARATOR}${peer}`)) continue
          if (seenByRoot.has(key)) continue
          seenByRoot.add(key)
          next.push({
            root: node.root,
            path: `${node.path}${PEER_PATH_SEPARATOR}${peer}`,
            chain: [...node.chain, peer],
            pkg: peer,
            spec,
          })
        }
      }

      frontier = await pMap(
        next,
        async ({ root, path, chain, pkg, spec }) => {
          const { dependencies } = await lookup(pkg, spec)
          // a peer back on the root or an earlier package on the chain changes along with it, so it is not a constraint
          const peers = Object.fromEntries(Object.entries(dependencies).filter(([peer]) => !chain.includes(peer)))
          peerDepsMap[path] = peers
          return { root, path, chain, pkg, version: spec, peers }
        },
        { concurrency: options.concurrency },
      )
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
