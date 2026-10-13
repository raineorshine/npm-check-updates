import { escapeRegExp } from './escapeRegExp.ts'

/** Matches pnpm package patterns: only * is a wildcard, and the last matching rule wins. */
export default function createPnpmMatcher(patterns: string[] = []): (name: string) => boolean {
  const rules = patterns.map(pattern => {
    const negated = pattern.startsWith('!')
    const glob = negated ? pattern.slice(1) : pattern
    const regex = new RegExp('^' + escapeRegExp(glob).replace(/\\\*/g, '.*') + '$')
    return { negated, regex }
  })
  const defaultMatch = rules.length > 0 && rules.every(rule => rule.negated)
  return name => rules.reduce((matched, { negated, regex }) => (regex.test(name) ? !negated : matched), defaultMatch)
}
