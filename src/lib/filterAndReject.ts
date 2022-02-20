import _ from 'lodash'
import { and } from 'fp-and-or'
import minimatch from 'minimatch'
import { SemVer, parseRange } from 'semver-utils'
import { FilterRejectPattern, Maybe, VersionSpec } from '../types'

/**
 * Creates a filter function from a given filter string. Supports
 * strings, wildcards, comma-or-space-delimited lists, and regexes.
 *
 * @param [filterPattern]
 * @returns
 */
function composeFilter(filterPattern: FilterRejectPattern): (name: string, versionSpec: VersionSpec) => boolean {

  let predicate: (name: string, versionSpec: VersionSpec) => boolean

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
    predicate = (dependencyName: string, versionSpec: string) => filterPattern.some(
      (subpattern: string | RegExp) => composeFilter(subpattern)(dependencyName, versionSpec)
    )
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (dependencyName: string) => filterPattern.test(dependencyName)
  }
  // function
  else if (typeof filterPattern === 'function') {
    predicate = (dependencyName: string, versionSpec: string) => filterPattern(dependencyName, parseRange(versionSpec ?? dependencyName))
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
    (dependencyName: VersionSpec, version: SemVer[]) => and(
      filter ? composeFilter(filter) : _.identity,
      reject ? _.negate(composeFilter(reject)) : _.identity
    )(dependencyName, version),
    // filter version
    (dependencyName: VersionSpec, version: SemVer[]) => and(
      filterVersion ? composeFilter(filterVersion) : _.identity,
      rejectVersion ? _.negate(composeFilter(rejectVersion)) : _.identity
    )(version)
  )
}

export default filterAndReject
