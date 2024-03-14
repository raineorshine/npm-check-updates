import { and, or } from 'fp-and-or'
import { identity, negate } from 'lodash-es'
import picomatch from 'picomatch'
import { parseRange } from 'semver-utils'
import { FilterPattern } from '../types/FilterPattern.js'
import { Maybe } from '../types/Maybe.js'
import { VersionSpec } from '../types/VersionSpec.js'

/**
 * Creates a filter function from a given filter string. Supports
 * strings, wildcards, comma-or-space-delimited lists, and regexes.
 *
 * @param [filterPattern]
 * @returns
 */
function composeFilter(filterPattern: FilterPattern): (name: string, versionSpec?: string) => boolean {
  let predicate: (name: string, versionSpec?: string) => boolean

  // no filter
  if (!filterPattern) {
    predicate = identity
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
      const patterns = filterPattern.split(/[\s,]+/)
      predicate = (dependencyName: string) => {
        /** Returns true if the pattern matches an unscoped dependency name. */
        const matchUnscoped = (pattern: string) => picomatch(pattern)(dependencyName)

        /** Returns true if the pattern matches a scoped dependency name. */
        const matchScoped = (pattern: string) =>
          !pattern.includes('/') &&
          dependencyName.includes('/') &&
          picomatch(pattern)(dependencyName.replace(/\//g, '_'))

        // return true if any of the provided patterns match the dependency name
        return patterns.some(or(matchUnscoped, matchScoped))
      }
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    predicate = (dependencyName: string, versionSpec?: string) =>
      filterPattern.some(subpattern => composeFilter(subpattern)(dependencyName, versionSpec))
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (dependencyName: string) => filterPattern.test(dependencyName)
  }
  // function
  else if (typeof filterPattern === 'function') {
    predicate = (dependencyName: string, versionSpec?: string) =>
      filterPattern(dependencyName, parseRange((versionSpec as string) ?? dependencyName))
  } else {
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
function filterAndReject(
  filter: Maybe<FilterPattern>,
  reject: Maybe<FilterPattern>,
  filterVersion: Maybe<FilterPattern>,
  rejectVersion: Maybe<FilterPattern>,
) {
  return and(
    // filter dep
    (dependencyName: VersionSpec, version: string) =>
      and(filter ? composeFilter(filter) : true, reject ? negate(composeFilter(reject)) : true)(
        dependencyName,
        version,
      ),
    // filter version
    (dependencyName: VersionSpec, version: string) =>
      and(
        filterVersion ? composeFilter(filterVersion) : true,
        rejectVersion ? negate(composeFilter(rejectVersion)) : true,
      )(version),
  )
}

export default filterAndReject
