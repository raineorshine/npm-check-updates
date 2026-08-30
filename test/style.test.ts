import { stripVTControlCharacters as stripAnsi } from 'node:util'
import { describe, expect, it } from 'vitest'
import style, { getStyle, styleInit } from '../src/lib/style.ts'

describe('style', () => {
  describe('getStyle', () => {
    it('returns a no-op passthrough when color is null', () => {
      expect(getStyle(null).red('x')).toBe('x')
      expect(getStyle(null).red.bold('x')).toBe('x')
    })

    it('returns a no-op passthrough when color is false', () => {
      expect(getStyle(false).red('x')).toBe('x')
      expect(getStyle(false).red.bold('x')).toBe('x')
    })

    it('forces color when color is true', () => {
      const colored = getStyle(true).red('x')
      expect(colored).not.toBe('x')
      expect(stripAnsi(colored)).toBe('x')
    })

    it('supports chained styles when forced', () => {
      const chained = getStyle(true).dim.underline('x')
      expect(chained).not.toBe('x')
      expect(stripAnsi(chained)).toBe('x')
    })

    it('leaves empty strings unstyled', () => {
      expect(getStyle(true).red('')).toBe('')
    })

    it('styles each line separately so the style does not bleed past a newline', () => {
      const lines = getStyle(true).gray('a\nb').split('\n')
      expect(lines).toHaveLength(2)
      expect(lines.map(stripAnsi)).toEqual(['a', 'b'])
      // each line carries its own codes instead of one left open across the newline
      for (const line of lines) {
        expect(line).not.toBe(stripAnsi(line))
      }
    })
  })

  describe('global style', () => {
    // must run before styleInit is called below (styleInstance is a module-level global)
    it('throws when used before styleInit', () => {
      expect(() => style.red('x')).toThrow('Style has not been initialized')
    })

    it('passes strings through after styleInit(null), including bold and underline', () => {
      styleInit(null)
      expect(style.red('x')).toBe('x')
      expect(style.red.bold('x')).toBe('x')
      expect(style.red.underline('x')).toBe('x')
    })
  })
})
