import { describe, expect, it } from 'vitest'
import { isPreSelectedGroup, isPreSelectedUpgrade, resolveInteractiveSelect } from '../src/lib/isPreSelected.ts'

describe('resolveInteractiveSelect', () => {
  it('defaults to minor with --format group', () => {
    expect(resolveInteractiveSelect({ format: ['group'] })).toBe('minor')
  })

  it('defaults to all without --format group', () => {
    expect(resolveInteractiveSelect({})).toBe('all')
    expect(resolveInteractiveSelect({ format: ['repo'] })).toBe('all')
  })

  it('resolves an explicit auto the same as the default', () => {
    expect(resolveInteractiveSelect({ format: ['group'], interactiveSelect: 'auto' })).toBe('minor')
    expect(resolveInteractiveSelect({ interactiveSelect: 'auto' })).toBe('all')
  })

  it('respects an explicit value in either format', () => {
    expect(resolveInteractiveSelect({ format: ['group'], interactiveSelect: 'none' })).toBe('none')
    expect(resolveInteractiveSelect({ interactiveSelect: 'patch' })).toBe('patch')
  })
})

describe('isPreSelectedGroup', () => {
  it('none pre-selects nothing', () => {
    expect(isPreSelectedGroup('patch', 'none')).toBe(false)
    expect(isPreSelectedGroup('minor', 'none')).toBe(false)
    expect(isPreSelectedGroup('major', 'none')).toBe(false)
    expect(isPreSelectedGroup('majorVersionZero', 'none')).toBe(false)
  })

  it('patch pre-selects patch only', () => {
    expect(isPreSelectedGroup('patch', 'patch')).toBe(true)
    expect(isPreSelectedGroup('minor', 'patch')).toBe(false)
    expect(isPreSelectedGroup('major', 'patch')).toBe(false)
    expect(isPreSelectedGroup('majorVersionZero', 'patch')).toBe(false)
  })

  it('minor pre-selects patch and minor', () => {
    expect(isPreSelectedGroup('patch', 'minor')).toBe(true)
    expect(isPreSelectedGroup('minor', 'minor')).toBe(true)
    expect(isPreSelectedGroup('major', 'minor')).toBe(false)
    expect(isPreSelectedGroup('majorVersionZero', 'minor')).toBe(false)
  })

  it('all pre-selects everything', () => {
    expect(isPreSelectedGroup('patch', 'all')).toBe(true)
    expect(isPreSelectedGroup('minor', 'all')).toBe(true)
    expect(isPreSelectedGroup('major', 'all')).toBe(true)
    expect(isPreSelectedGroup('majorVersionZero', 'all')).toBe(true)
  })

  it('pre-selects custom groups with all only', () => {
    expect(isPreSelectedGroup('custom', 'all')).toBe(true)
    expect(isPreSelectedGroup('custom', 'minor')).toBe(false)
    expect(isPreSelectedGroup('custom', 'patch')).toBe(false)
    expect(isPreSelectedGroup('custom', 'none')).toBe(false)
  })
})

describe('isPreSelectedUpgrade', () => {
  it('derives the group from the semver part that changed', () => {
    expect(isPreSelectedUpgrade('1.0.0', '1.0.1', 'patch')).toBe(true)
    expect(isPreSelectedUpgrade('1.0.0', '1.1.0', 'patch')).toBe(false)
    expect(isPreSelectedUpgrade('1.0.0', '1.1.0', 'minor')).toBe(true)
    expect(isPreSelectedUpgrade('1.0.0', '2.0.0', 'minor')).toBe(false)
    expect(isPreSelectedUpgrade('1.0.0', '2.0.0', 'all')).toBe(true)
    expect(isPreSelectedUpgrade('1.0.0', '1.0.1', 'none')).toBe(false)
  })

  it('handles range operators', () => {
    expect(isPreSelectedUpgrade('^1.0.0', '^1.0.1', 'patch')).toBe(true)
    expect(isPreSelectedUpgrade('<1.2.3', '^1.2.9', 'patch')).toBe(true)
    expect(isPreSelectedUpgrade('^1.0.0', '^2.0.0', 'minor')).toBe(false)
  })

  it('treats major version zero as major', () => {
    expect(isPreSelectedUpgrade('0.1.0', '0.2.0', 'minor')).toBe(false)
    expect(isPreSelectedUpgrade('0.1.0', '0.1.1', 'patch')).toBe(false)
    expect(isPreSelectedUpgrade('0.1.0', '0.2.0', 'all')).toBe(true)
  })
})
