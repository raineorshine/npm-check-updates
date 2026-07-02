import { describe, expect, it } from 'vitest'
import chalk, { chalkInit, getChalk } from '../src/lib/chalk.ts'

describe('chalk', () => {
  describe('getChalk', () => {
    it('returns a no-op passthrough when color is null', () => {
      expect(getChalk(null).red('x')).toBe('x')
      expect(getChalk(null).red.bold('x')).toBe('x')
    })

    it('forces color when color is true', () => {
      const colored = getChalk(true).red('x')
      expect(colored).not.toBe('x')
      expect(colored).toContain('x')
    })
  })

  describe('global chalk', () => {
    // must run before chalkInit is called below (chalkInstance is a module-level global)
    it('throws when used before chalkInit', () => {
      expect(() => chalk.red('x')).toThrow('Chalk has not been imported')
    })

    it('passes strings through after chalkInit(null), including bold and underline', () => {
      chalkInit(null)
      expect(chalk.red('x')).toBe('x')
      expect(chalk.red.bold('x')).toBe('x')
      expect(chalk.red.underline('x')).toBe('x')
    })
  })
})
