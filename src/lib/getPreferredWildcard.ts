import { type Index } from '../types/IndexType.ts'
import { sortBy } from './utils/sortBy.ts'
import { WILDCARDS } from './version-util.ts'

/**
 *
 * @param dependencies A dependencies collection
 * @returns Returns whether the user prefers ^, ~, .*, or .x
 * (simply counts the greatest number of occurrences) or `null` if
 * given no dependencies.
 */
function getPreferredWildcard(dependencies: Index<string | null>) {
  // if there are no dependencies, return null.
  if (Object.keys(dependencies).length === 0) {
    return null
  }

  // group the dependencies by wildcard
  const groups: Record<string, (string | null)[]> = {}
  for (const dep of Object.values(dependencies)) {
    const wildcard = WILDCARDS.find((wildcard: string) => dep && dep.includes(wildcard))
    if (wildcard !== undefined) {
      groups[wildcard] ||= []
      groups[wildcard].push(dep)
    }
  }

  const arrOfGroups = Object.entries(groups).map(([wildcard, instances]) => ({ wildcard, instances }))

  // reverse sort the groups so that the wildcard with the most appearances is at the head, then return it.
  const sorted = sortBy(arrOfGroups, wildcardObject => -wildcardObject.instances.length)

  return sorted.length > 0 ? sorted[0].wildcard : null
}

export default getPreferredWildcard
