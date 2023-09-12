import { and, or } from 'fp-and-or'
import identity from 'lodash/identity'
import negate from 'lodash/negate'
import { minimatch } from 'minimatch'
import { SemVer, parseRange } from 'semver-utils'
import { FilterPattern } from '../types/FilterPattern'
import { Maybe } from '../types/Maybe'
import { VersionSpec } from '../types/VersionSpec'

/**
 * Creates a filter function from a given filter string. Supports
 * strings, wildcards, comma-or-space-delimited lists, and regexes.
 *
 * @param [filterPattern]
 * @returns
 */
function composeFilter(filterPattern: FilterPattern): (name: string, versionSpec: VersionSpec) => boolean {
  let predicate: (name: string, versionSpec: VersionSpec) => boolean

  // no filter
  if (!filterPattern) {
    predicate = identity
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
      predicate = (dependencyName: string) => {
        /** Returns true if the pattern matches an unscoped dependency name. */
        const matchUnscoped = (pattern: string) => minimatch(dependencyName, pattern)

        /** Returns true if the pattern matches a scoped dependency name. */
        const matchScoped = (pattern: string) =>
          !pattern.includes('/') &&
          dependencyName.includes('/') &&
          minimatch(dependencyName.replace(/\//g, '_'), pattern)

        // return true if any of the provided patterns match the dependency name
        return patterns.some(or(matchUnscoped, matchScoped))
      }
    }
  }
  // array
  else if (Array.isArray(filterPattern)) {
    predicate = (dependencyName: string, versionSpec: string) =>
      filterPattern.some(subpattern => composeFilter(subpattern)(dependencyName, versionSpec))
  }
  // raw RegExp
  else if (filterPattern instanceof RegExp) {
    predicate = (dependencyName: string) => filterPattern.test(dependencyName)
  }
  // function
  else if (typeof filterPattern === 'function') {
    predicate = (dependencyName: string, versionSpec: string) =>
      filterPattern(dependencyName, parseRange(versionSpec ?? dependencyName))
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
    (dependencyName: VersionSpec, version: SemVer[]) =>
      and(filter ? composeFilter(filter) : identity, reject ? negate(composeFilter(reject)) : identity)(
        dependencyName,
        version,
      ),
    // filter version
    (dependencyName: VersionSpec, version: SemVer[]) =>
      and(
        filterVersion ? composeFilter(filterVersion) : identity,
        rejectVersion ? negate(composeFilter(rejectVersion)) : identity,
      )(version),
  )
}

export default filterAndReject
