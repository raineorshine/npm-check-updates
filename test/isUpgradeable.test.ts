import { describe, expect, it } from 'vitest'
import isUpgradeable from '../src/lib/isUpgradeable.ts'

describe('isUpgradeable', () => {
  it('do not upgrade pure wildcards', () => {
    expect(isUpgradeable('*', '0.5.1')).toBe(false)
  })

  it('upgrade versions that do not satisfy latest versions', () => {
    expect(isUpgradeable('0.1.x', '0.5.1')).toBe(true)
  })

  it('do not upgrade invalid versions', () => {
    expect(isUpgradeable('https://github.com/strongloop/express', '4.11.2')).toBe(false)
  })

  it('do not upgrade versions beyond the latest', () => {
    expect(isUpgradeable('5.0.0', '4.11.2')).toBe(false)
  })

  it('handle comparison constraints', () => {
    expect(isUpgradeable('>1.0', '0.5.1')).toBe(false)
    expect(isUpgradeable('<3.0 >0.1', '0.5.1')).toBe(false)
    expect(isUpgradeable('>0.1.x', '0.5.1')).toBe(true)
    expect(isUpgradeable('<7.0.0', '7.2.0')).toBe(true)
    expect(isUpgradeable('<7.0', '7.2.0')).toBe(true)
    expect(isUpgradeable('<7', '7.2.0')).toBe(true)
  })

  it('upgrade simple versions', () => {
    expect(isUpgradeable('v1', 'v2')).toBe(true)
  })
})
