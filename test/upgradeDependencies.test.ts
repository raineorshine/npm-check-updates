import { describe, expect, it } from 'vitest'
import upgradeDependencies from '../src/lib/upgradeDependencies.ts'

describe('upgradeDependencies', () => {
  it('upgrade simple, non-semver versions', () => {
    expect(upgradeDependencies({ foo: '1' }, { foo: '2' })).toStrictEqual({ foo: '2' })
    expect(upgradeDependencies({ foo: '1.0' }, { foo: '1.1' })).toStrictEqual({ foo: '1.1' })
    expect(upgradeDependencies({ 'ncu-test-simple-tag': 'v1' }, { 'ncu-test-simple-tag': 'v3' })).toStrictEqual({
      'ncu-test-simple-tag': 'v3',
    })
  })

  it('upgrade github dependencies', () => {
    expect(upgradeDependencies({ foo: 'github:foo/bar#v1' }, { foo: 'github:foo/bar#v2' })).toStrictEqual({
      foo: 'github:foo/bar#v2',
    })
    expect(upgradeDependencies({ foo: 'github:foo/bar#v1.0' }, { foo: 'github:foo/bar#v2.0' })).toStrictEqual({
      foo: 'github:foo/bar#v2.0',
    })
    expect(upgradeDependencies({ foo: 'github:foo/bar#v1.0.0' }, { foo: 'github:foo/bar#v2.0.0' })).toStrictEqual({
      foo: 'github:foo/bar#v2.0.0',
    })
  })

  it('upgrade latest versions that already satisfy the specified version', () => {
    expect(upgradeDependencies({ mongodb: '^1.0.0' }, { mongodb: '1.4.30' })).toStrictEqual({
      mongodb: '^1.4.30',
    })
  })

  it('do not downgrade', () => {
    expect(upgradeDependencies({ mongodb: '^2.0.7' }, { mongodb: '1.4.30' })).toStrictEqual({})
  })

  it('allow to update to latest via @latest tag', () => {
    expect(
      upgradeDependencies({ mongodb: '^1.5.0-alpha.1' }, { mongodb: '1.4.30' }, { target: '@latest' }),
    ).toStrictEqual({
      mongodb: '^1.4.30',
    })
  })

  it('use the preferred wildcard when converting <, closed, or mixed ranges', () => {
    expect(upgradeDependencies({ a: '1.*', mongodb: '<1.0' }, { mongodb: '3.0.0' })).toStrictEqual({ mongodb: '3.*' })
    expect(upgradeDependencies({ a: '1.x', mongodb: '<1.0' }, { mongodb: '3.0.0' })).toStrictEqual({ mongodb: '3.x' })
    expect(upgradeDependencies({ a: '~1', mongodb: '<1.0' }, { mongodb: '3.0.0' })).toStrictEqual({ mongodb: '~3.0' })
    expect(upgradeDependencies({ a: '^1', mongodb: '<1.0' }, { mongodb: '3.0.0' })).toStrictEqual({ mongodb: '^3.0' })

    expect(upgradeDependencies({ a: '1.*', mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' })).toStrictEqual({
      mongodb: '3.*',
    })
    expect(upgradeDependencies({ mongodb: '1.0 < 2.*' }, { mongodb: '3.0.0' })).toStrictEqual({ mongodb: '3.*' })
  })

  it('convert closed ranges to caret (^) when preferred wildcard is unknown', () => {
    expect(upgradeDependencies({ mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' })).toStrictEqual({ mongodb: '^3.0' })
  })

  it('ignore packages with empty values', () => {
    expect(upgradeDependencies({ mongodb: null }, { mongodb: '1.4.30' })).toStrictEqual({})
    expect(upgradeDependencies({ mongodb: '' }, { mongodb: '1.4.30' })).toStrictEqual({})
  })
})
