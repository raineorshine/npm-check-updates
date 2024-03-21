import { Index } from '../types/IndexType'

/**
 * Checks if the specified package will create a loop of peer dependencies by traversing all paths to find a cycle
 */
export function isCircularPeer(peerDependencies: Index<Index<string>>, packageName: string): boolean {
  const hasChecked = new Set<string>()
  const toCheck: string[] = []
  let pointer: string | undefined = packageName
  while (pointer !== undefined) {
    const obj = peerDependencies[pointer]
    for (const depPackageName of Object.keys(obj ?? {})) {
      if (!hasChecked.has(depPackageName)) {
        toCheck.push(depPackageName)
        hasChecked.add(depPackageName)
      }
    }
    pointer = toCheck.shift()
    if (pointer === packageName) {
      return true
    }
  }
  return false
}
