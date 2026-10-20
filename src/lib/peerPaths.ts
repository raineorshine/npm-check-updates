import { type Index } from '../types/IndexType.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'

/**
 * Peer dependency maps are keyed by package name, plus a path such as "wick-a11y > cypress-axe" for the peers of a
 * peer the project does not list. A path entry belongs to the package at its root, so it is replaced or dropped along
 * with that package's own entry. Package names cannot contain spaces, so the separator is unambiguous.
 */
export const PEER_PATH_SEPARATOR = ' > '

/** Returns the package that a peer dependency map key belongs to. */
export const rootOf = (key: string): string => key.split(PEER_PATH_SEPARATOR)[0]

/** Returns the peer dependency entries that belong to a package: its own and those of the unlisted peers it brings in. */
export const peersOf = (
  peerDependencies: Index<Index<VersionSpec>> | undefined,
  pkg: string,
): [key: string, peers: Index<VersionSpec>][] =>
  Object.entries(peerDependencies ?? {}).filter(([key]) => rootOf(key) === pkg)

/** Merges peer dependency maps. Each package in next replaces every entry that belongs to it in base. */
export const mergePeerDependencies = (
  base: Index<Index<VersionSpec>> | undefined,
  next: Index<Index<VersionSpec>> | undefined,
): Index<Index<VersionSpec>> => {
  const replaced = new Set(Object.keys(next ?? {}).map(rootOf))
  return {
    ...Object.fromEntries(Object.entries(base ?? {}).filter(([key]) => !replaced.has(rootOf(key)))),
    ...next,
  }
}
