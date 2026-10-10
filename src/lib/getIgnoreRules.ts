import semver from 'semver'
import { type IgnoreRules } from '../types/IgnoreRules.ts'
import { type Options } from '../types/Options.ts'
import { type ResolvedIgnoreRule } from '../types/ResolvedIgnoreRule.ts'
import { composeFilter } from './filterAndReject.ts'
import programError from './programError.ts'

/** Returns the rules whose key matches any of the given names, e.g. an npm alias and its real package name. */
export type IgnoreRuleMatcher = (names: string[]) => ResolvedIgnoreRule[]

// keyed on the ignore object, since workspace configs are merged into options without going through initOptions
const matcherCache = new WeakMap<IgnoreRules, IgnoreRuleMatcher>()

/** Validates options.ignore and compiles it into a matcher. Returns null when there are no rules. */
function getIgnoreRules(options: Options): IgnoreRuleMatcher | null {
  const { ignore } = options
  if (ignore == null) return null
  if (typeof ignore !== 'object' || Array.isArray(ignore)) {
    programError(
      options,
      'Invalid ignore option. Expected an object that maps package names to version ranges. The ignore option is only available in a config file or the module API, not on the command line.',
    )
  }

  const cached = matcherCache.get(ignore)
  if (cached) return cached

  const rules = Object.entries(ignore).map(([key, value]) => {
    const versions = typeof value === 'string' ? value : value?.versions
    const reason = typeof value === 'object' && value ? value.reason : undefined
    if (typeof versions !== 'string') {
      programError(
        options,
        `Invalid ignore rule for "${key}". Expected a version range string or { versions, reason } object.`,
      )
    }
    if (!semver.validRange(versions)) {
      programError(options, `Invalid ignore rule for "${key}". "${versions}" is not a valid semver range.`)
    }
    if (reason !== undefined && typeof reason !== 'string') {
      programError(options, `Invalid ignore rule for "${key}". The reason must be a string.`)
    }
    return {
      isMatch: composeFilter(key, { allowFunction: false }),
      rule: { range: versions, ...(reason ? { reason } : null) },
    }
  })

  const matcher: IgnoreRuleMatcher = names =>
    rules.filter(({ isMatch }) => names.some(name => isMatch(name))).map(({ rule }) => rule)

  matcherCache.set(ignore, matcher)
  return matcher
}

export default getIgnoreRules
