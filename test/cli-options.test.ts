import path from 'node:path'
import { describe, expect, it } from 'vitest'
import cliOptions, { cliOptionsMap } from '../src/cli-options.ts'

describe('cli-options', () => {
  it('require long and description properties', () => {
    for (const option of cliOptions) {
      expect(option).toHaveProperty('long')
      expect(option).toHaveProperty('description')
    }
  })

  describe('parse', () => {
    it('parses a numeric option from a string or number', () => {
      expect(cliOptionsMap.concurrency.parse!('8')).toBe(8)
      expect(cliOptionsMap.concurrency.parse!(5)).toBe(5)
    })

    it('throws when a numeric option is not a number', () => {
      expect(() => cliOptionsMap.concurrency.parse!('abc')).toThrow('concurrency must be a number')
    })

    it('coerces --pre to a boolean', () => {
      expect(cliOptionsMap.pre.parse!(1)).toBe(true)
      expect(cliOptionsMap.pre.parse!('0')).toBe(false)
    })

    it('parses --cooldown duration strings into days', () => {
      expect(cliOptionsMap.cooldown.parse!('12h')).toBe(0.5)
      expect(cliOptionsMap.cooldown.parse!('7d')).toBe(7)
      expect(cliOptionsMap.cooldown.parse!(3)).toBe(3)
    })

    it('parses a bare --cooldown number as days', () => {
      expect(cliOptionsMap.cooldown.parse!('5')).toBe(5)
      expect(cliOptionsMap.cooldown.parse!(' 1.5 ')).toBe(1.5)
    })

    it('returns NaN for a --cooldown string it cannot read', () => {
      // an unrecognized unit must not be truncated to its leading digits
      expect(cliOptionsMap.cooldown.parse!('7x')).toBeNaN()
      expect(cliOptionsMap.cooldown.parse!('2 weeks')).toBeNaN()
      expect(cliOptionsMap.cooldown.parse!('invalid')).toBeNaN()
      expect(cliOptionsMap.cooldown.parse!('')).toBeNaN()
    })

    it('resolves --cacheFile to an absolute path and rejects non-strings', () => {
      expect(path.isAbsolute(cliOptionsMap.cacheFile.parse!('foo.json') as string)).toBe(true)
      expect(() => cliOptionsMap.cacheFile.parse!(5)).toThrow('cacheFile must be a string')
    })

    it('marks accumulate exactly on options whose parse takes an accumulator', () => {
      // accumulate parses are only ever called by commander, so a value already parsed once by
      // initOptions must never reach one with a single argument
      for (const option of cliOptions) {
        if (!option.parse) continue
        expect(!!option.accumulate).toBe(option.parse.length > 1)
      }
    })

    describe('idempotency', () => {
      // one already-parsed-once input per non-accumulate option with a parse, since the cli path
      // parses once via commander and initOptions parses again
      const cases: [string, unknown][] = [
        ['cacheExpiration', '10'],
        ['cacheFile', 'foo.json'],
        ['concurrency', '8'],
        ['cooldown', '12h'],
        ['dep', 'prod,dev'],
        ['errorLevel', '2'],
        ['format', 'no-group,time'],
        ['pre', 1],
        ['retry', '5'],
        ['timeout', '5000'],
      ]

      it('covers every non-accumulate option that has a parse', () => {
        const expected = cliOptions
          .filter(option => option.parse && !option.accumulate)
          .map(option => option.long)
          .sort()
        expect(cases.map(([long]) => long).sort()).toStrictEqual(expected)
      })

      it.each(cases)('parse(parse(x)) equals parse(x) for %s', (long, raw) => {
        const parse = cliOptionsMap[long].parse!
        const once = parse(raw)
        expect(parse(once)).toStrictEqual(once)
      })
    })
  })
})
