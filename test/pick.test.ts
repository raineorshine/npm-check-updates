import { describe, expect, it } from 'vitest'
import { pick, pickBy } from '../src/lib/pick.ts'

describe('pick', () => {
  it('picks the given properties', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toStrictEqual({ a: 1, c: 3 })
  })
})

describe('pickBy', () => {
  it('keeps properties whose value satisfies the predicate', () => {
    expect(pickBy({ a: 1, b: 2, c: 3 }, value => value > 1)).toStrictEqual({ b: 2, c: 3 })
  })

  it('passes the key to the predicate', () => {
    expect(pickBy({ a: 1, b: 2 }, (_value, key) => key === 'b')).toStrictEqual({ b: 2 })
  })

  it('returns an empty object for null or undefined input', () => {
    expect(pickBy(null, () => true)).toStrictEqual({})
    expect(pickBy(undefined, () => true)).toStrictEqual({})
  })
})
