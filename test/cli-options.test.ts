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

    it('resolves --cacheFile to an absolute path and rejects non-strings', () => {
      expect(path.isAbsolute(cliOptionsMap.cacheFile.parse!('foo.json') as string)).toBe(true)
      expect(() => cliOptionsMap.cacheFile.parse!(5)).toThrow('cacheFile must be a string')
    })
  })
})
