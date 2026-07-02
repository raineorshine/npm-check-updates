import { describe, expect, it } from 'vitest'
import wrap from '../src/lib/wrap.ts'

describe('wrap', () => {
  it('returns a short string unchanged', () => {
    expect(wrap('short string', 92)).toBe('short string')
  })

  it('preserves blank lines', () => {
    expect(wrap('one\n\ntwo', 20)).toBe('one\n\ntwo')
  })

  it('wraps on word boundaries', () => {
    expect(wrap('aaaa bbbb cccc dddd eeee', 10)).toBe('aaaa bbbb\ncccc dddd\neeee')
  })

  it('does not break in the middle of a flag like --registry', () => {
    expect(wrap('use the --registry option to set a custom registry', 20)).toBe(
      'use the --registry\noption to set a\ncustom registry',
    )
  })

  it('hard-breaks a word longer than the wrap length', () => {
    expect(wrap('supercalifragilisticexpialidocious', 10)).toBe('supercalifr\nagilisticex\npialidociou\ns')
  })
})
