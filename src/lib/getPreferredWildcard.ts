import _ from 'lodash'
import cint from 'cint'
import { Index } from '../types'
import { WILDCARDS } from '../version-util'

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
  const groups = _.groupBy(Object.values(dependencies), dep =>
    WILDCARDS.find((wildcard: string) =>
      dep && dep.includes(wildcard)
    )
  )

  delete groups.undefined // eslint-disable-line fp/no-delete

  // convert to an array of objects that can be sorted
  const arrOfGroups = cint.toArray<string[], { wildcard: string, instances: string[] }>(groups, (wildcard, instances) => ({
    wildcard,
    instances
  }))

  // reverse sort the groups so that the wildcard with the most appearances is at the head, then return it.
  const sorted = _.sortBy(arrOfGroups, wildcardObject => -wildcardObject.instances.length)

  return sorted.length > 0 ? sorted[0].wildcard : null
}

export default getPreferredWildcard
