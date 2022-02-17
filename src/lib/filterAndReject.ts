import _ from 'lodash'
import { and } from 'fp-and-or'
import minimatch from 'minimatch'
import { FilterFunction, FilterRejectPattern, Maybe, Version, VersionSpec } from '../types'

/**
 * Creates a filter function from a given filter string. Supports
 * strings, wildcards, comma-or-space-delimited lists, and regexes.
 *
 * @param [filterPattern]
 * @returns
 */
function composeFilter(filterPattern: FilterRejectPattern): FilterFunction {

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
      predicate = (dependencyName: string) => regexp.test(dependencyName)
    }
    // glob string
    else {
      const patterns = filterPattern.split(/[\s,]+/)
      predicate = (dependencyName: string) => patterns.some(pattern => minimatch(dependencyName, pattern))
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    predicate = (dependencyName: string, version:string) => filterPattern.some(
      (subpattern: string | RegExp) => composeFilter(subpattern)(dependencyName, version)
    )
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (dependencyName: string) => filterPattern.test(dependencyName)
  }
  // function
  else if (typeof filterPattern === 'function') {
    predicate = (dependencyName:string, version:string) => filterPattern?.(dependencyName, version)
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
 * @param [filter]
 * @param [reject]
 * @param [filterVersion]
 * @param [rejectVersion]
 */
function filterAndReject(filter: Maybe<FilterRejectPattern>, reject: Maybe<FilterRejectPattern>, filterVersion: Maybe<FilterRejectPattern>, rejectVersion: Maybe<FilterRejectPattern>) {
  return and(
    // filter dep
    (dep: VersionSpec, version: Version) => and(
      filter ? composeFilter(filter) : _.identity,
      reject ? _.negate(composeFilter(reject)) : _.identity
    )(dep, version),
    // filter version
    (dep: VersionSpec, version: Version) => and(
      filterVersion ? composeFilter(filterVersion) : _.identity,
      rejectVersion ? _.negate(composeFilter(rejectVersion)) : _.identity
    )(version)
  )
}

export default filterAndReject
