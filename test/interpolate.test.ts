import { describe, expect, it } from 'vitest'
import interpolate from '../src/lib/interpolate.ts'

describe('interpolate', () => {
  it('returns a string with no placeholder unchanged', () => {
    expect(interpolate('https://registry.example.com/', { VAR: 'x' })).toBe('https://registry.example.com/')
  })

  it('interpolates a set variable', () => {
    expect(interpolate(`\${VAR}/path/`, { VAR: 'https://registry.example.com' })).toBe(
      'https://registry.example.com/path/',
    )
  })

  it('interpolates every placeholder, not just the first', () => {
    expect(interpolate(`\${A}-\${B}-\${A}`, { A: 'one', B: 'two' })).toBe('one-two-one')
  })

  it('replaces an unset variable with an empty string', () => {
    expect(interpolate(`\${VAR}`, {})).toBe('')
    expect(interpolate(`prefix-\${VAR}-suffix`, {})).toBe('prefix--suffix')
  })

  // a value that itself looks like a placeholder is not expanded again, so a config cannot chain indirections
  it('does not interpolate the interpolated value', () => {
    expect(interpolate(`\${A}`, { A: `\${B}`, B: 'two' })).toBe(`\${B}`)
  })

  describe('dash fallback', () => {
    it('uses the fallback when the variable is unset', () => {
      expect(interpolate(`\${VAR-fallback}`, {})).toBe('fallback')
    })

    it('prefers the set variable over the fallback', () => {
      expect(interpolate(`\${VAR-fallback}`, { VAR: 'value' })).toBe('value')
    })

    // without the colon, only an unset variable falls back, so an intentional empty value is preserved
    it('keeps an empty value instead of falling back', () => {
      expect(interpolate(`\${VAR-fallback}`, { VAR: '' })).toBe('')
    })

    it('supports an empty fallback', () => {
      expect(interpolate(`\${VAR-}`, {})).toBe('')
    })
  })

  describe('colon-dash fallback', () => {
    it('uses the fallback when the variable is unset', () => {
      expect(interpolate(`\${VAR:-fallback}`, {})).toBe('fallback')
    })

    it('uses the fallback when the variable is set but empty', () => {
      expect(interpolate(`\${VAR:-fallback}`, { VAR: '' })).toBe('fallback')
    })

    it('prefers the set variable over the fallback', () => {
      expect(interpolate(`\${VAR:-fallback}`, { VAR: 'value' })).toBe('value')
    })
  })

  // callers rely on an unsupported placeholder surviving verbatim, so they can detect it and reject the value
  describe('unsupported placeholders', () => {
    it('leaves a placeholder with a non-word character untouched', () => {
      expect(interpolate(`\${A.B}`, { 'A.B': 'value' })).toBe(`\${A.B}`)
    })

    it('leaves an empty placeholder untouched', () => {
      expect(interpolate(`\${}`, {})).toBe(`\${}`)
    })

    it('leaves an unterminated placeholder untouched', () => {
      expect(interpolate(`\${VAR`, { VAR: 'value' })).toBe(`\${VAR`)
    })
  })
})
