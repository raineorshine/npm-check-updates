import picomatch from 'picomatch'
import { parseRange } from 'semver-utils'
import { type FilterPattern } from '../types/FilterPattern.ts'
import { type Maybe } from '../types/Maybe.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'

/**
 * Creates a filter function from a given filter string.
 * Supports strings, wildcards, comma-or-space-delimited lists, and regexes.
 * The filter function *may* throw an exception if the filter pattern is invalid.
 *
 * @param [filterPattern]
 * @returns
 */
function composeFilter(
  filterPattern: FilterPattern,
  { allowFunction = true }: { allowFunction?: boolean } = {},
): (name: string, versionSpec?: string) => boolean {
  let predicate: (name: string, versionSpec?: string) => boolean

  // no filter
  if (!filterPattern) {
    predicate = () => true
  }
  // string
  else if (typeof filterPattern === 'string') {
    // RegExp string
    if (filterPattern[0] === '/' && filterPattern.at(-1) === '/') {
      const regexp = new RegExp(filterPattern.slice(1, -1))
      predicate = (dependencyName: string) => regexp.test(dependencyName)
    }
    // glob string
    else {
      // compile each glob once instead of once per dependency name
      const matchers = filterPattern.split(/[\s,]+/).map(pattern => ({
        isMatch: picomatch(pattern),
        // a pattern without a slash may also match a scoped name with the slash replaced
        unscoped: !pattern.includes('/'),
      }))
      // return true if any of the provided patterns match the dependency name
      predicate = (dependencyName: string) =>
        matchers.some(
          ({ isMatch, unscoped }) =>
            isMatch(dependencyName) ||
            (unscoped && dependencyName.includes('/') && isMatch(dependencyName.replaceAll('/', '_'))),
        )
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    const subpredicates = filterPattern.map(subpattern => composeFilter(subpattern, { allowFunction }))
    predicate = (dependencyName: string, versionSpec?: string) =>
      subpredicates.some(subpredicate => subpredicate(dependencyName, versionSpec))
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (dependencyName: string) => filterPattern.test(dependencyName)
  }
  // function
  else if (typeof filterPattern === 'function') {
    if (!allowFunction) {
      throw new TypeError(
        'filterVersion and rejectVersion do not support predicate functions. Use filter or reject instead, which receive the package name and parsed current version.',
      )
    }
    predicate = (dependencyName: string, versionSpec?: string) =>
      !!filterPattern(dependencyName, parseRange(versionSpec ?? dependencyName))
  } else {
    throw new TypeError('Invalid filter. Must be a RegExp, array, or comma-or-space-delimited list.')
  }

  return predicate
}

/**
 * Composes a filter function from filter, reject, filterVersion, and rejectVersion patterns. The filter function *may* throw an exception if the filter pattern is invalid.
 *
 * @param [filter]
 * @param [reject]
 * @param [filterVersion]
 * @param [rejectVersion]
 */
function filterAndReject(
  filter: Maybe<FilterPattern>,
  reject: Maybe<FilterPattern>,
  filterVersion: Maybe<FilterPattern>,
  rejectVersion: Maybe<FilterPattern>,
) {
  // compose the predicates up front, otherwise they are rebuilt for every dependency name
  const filterDep = filter ? composeFilter(filter) : null
  const rejectDep = reject ? composeFilter(reject) : null
  const filterVer = filterVersion ? composeFilter(filterVersion, { allowFunction: false }) : null
  const rejectVer = rejectVersion ? composeFilter(rejectVersion, { allowFunction: false }) : null

  return (dependencyName: VersionSpec, version: string): boolean =>
    // filter dep
    (!filterDep || filterDep(dependencyName, version)) &&
    (!rejectDep || !rejectDep(dependencyName, version)) &&
    // filter version
    (!filterVer || filterVer(version)) &&
    (!rejectVer || !rejectVer(version))
}

export default filterAndReject
