import { describe, expect, it } from 'vitest'
import getIgnoreRules from '../src/lib/getIgnoreRules.ts'
import { type IgnoreRules } from '../src/index.ts'

describe('ignore', () => {
  describe('rules', () => {
    it('normalizes a range string and a { versions, reason } object', () => {
      const match = getIgnoreRules({
        ignore: { react: '^18', vue: { versions: '^3', reason: 'Waiting for plugins' } },
      })!
      expect(match(['react'])).toEqual([{ range: '^18' }])
      expect(match(['vue'])).toEqual([{ range: '^3', reason: 'Waiting for plugins' }])
      expect(match(['lodash'])).toEqual([])
    })

    it('returns null when there are no rules', () => {
      expect(getIgnoreRules({})).toBeNull()
    })

    it('matches scope globs and exact names', () => {
      const match = getIgnoreRules({ ignore: { '@mui/*': '^8', 'eslint-config-prettier': '9.1.1' } })!
      expect(match(['@mui/material'])).toEqual([{ range: '^8' }])
      expect(match(['react'])).toEqual([])
      expect(match(['eslint-config-prettier'])).toEqual([{ range: '9.1.1' }])
      expect(match(['eslint-config-prettier-foo'])).toEqual([])
    })

    it('matches any of the given names, such as an npm alias and its real package name', () => {
      const match = getIgnoreRules({ ignore: { '@mui/material': '^9' } })!
      expect(match(['mui', '@mui/material'])).toEqual([{ range: '^9' }])
    })

    it('returns every matching rule', () => {
      const match = getIgnoreRules({
        ignore: { '@mui/*': { versions: '^9', reason: 'A' }, '@mui/material': { versions: '9.1.0', reason: 'B' } },
      })!
      expect(match(['@mui/material'])).toEqual([
        { range: '^9', reason: 'A' },
        { range: '9.1.0', reason: 'B' },
      ])
    })

    it('rejects an invalid range, naming the key', () => {
      expect(() => getIgnoreRules({ ignore: { react: 'not a range' } })).toThrow(/react/)
    })

    it('rejects a rule without versions, naming the key', () => {
      expect(() => getIgnoreRules({ ignore: { react: { reason: 'x' } } as unknown as IgnoreRules })).toThrow(/react/)
    })

    it('rejects a rule that is not a string or object, naming the key', () => {
      expect(() => getIgnoreRules({ ignore: { react: 5 } as unknown as IgnoreRules })).toThrow(/react/)
    })

    it('rejects a non-string reason, naming the key', () => {
      expect(() =>
        getIgnoreRules({ ignore: { react: { versions: '^18', reason: 5 } } as unknown as IgnoreRules }),
      ).toThrow(/react/)
    })

    it('rejects a string, as passed on the command line, with a config-only message', () => {
      expect(() => getIgnoreRules({ ignore: 'react@18' as unknown as IgnoreRules })).toThrow(/config/)
    })
  })
})
