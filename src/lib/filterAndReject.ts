import _ from 'lodash'
import { and } from 'fp-and-or'
import minimatch from 'minimatch'
import { FilterPattern, Maybe, Version, VersionSpec } from '../types'

/**
 * Creates a filter function from a given filter string. Supports
 * strings, wildcards, comma-or-space-delimited lists, and regexes.
 *
 * @param [filter]
 * @returns
 */
function composeFilter(filterPattern: FilterPattern): (s: string) => boolean {

  let predicate

  // no filter
  if (!filterPattern) {
    predicate = _.identity
  }
  // string
  else if (typeof filterPattern === 'string') {
    // RegExp string
    if (filterPattern[0] === '/' && filterPattern[filterPattern.length - 1] === '/') {
      const regexp = new RegExp(filterPattern.slice(1, -1))
      predicate = (s: string) => regexp.test(s)
    }
    // glob string
    else {
      const patterns = filterPattern.split(/[\s,]+/)
      predicate = (s: string) => patterns.some(pattern => minimatch(s, pattern))
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    predicate = (s: string) => filterPattern.some(
      (subpattern: string | RegExp) => composeFilter(subpattern)(s)
    )
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (s: string) => filterPattern.test(s)
  }
  else {
    throw new TypeError('Invalid filter. Must be a RegExp, array, or comma-or-space-delimited list.')
  }

  // limit the arity to 1 to avoid passing the value
  return predicate
}
/**
 * Composes a filter function from filter, reject, filterVersion, and rejectVersion patterns.
 *
 * @param filter
 * @param reject
 * @param filterVersion
 * @param rejectVersion
 */
function filterAndReject(filter: Maybe<FilterPattern>, reject: Maybe<FilterPattern>, filterVersion: Maybe<FilterPattern>, rejectVersion: Maybe<FilterPattern>) {
  return and(
    // filter dep
    (dep: VersionSpec) => and(
      filter ? composeFilter(filter) : _.identity,
      reject ? _.negate(composeFilter(reject)) : _.identity
    )(dep),
    // filter version
    (dep: VersionSpec, version: Version) => and(
      filterVersion ? composeFilter(filterVersion) : _.identity,
      rejectVersion ? _.negate(composeFilter(rejectVersion)) : _.identity
    )(version)
  )
}

export default filterAndReject
