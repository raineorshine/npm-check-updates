import { describe, expect, it } from 'vitest'
import resolveTarget from '../src/lib/resolveTarget.ts'

describe('resolveTarget', () => {
  it('defaults to latest', () => {
    expect(resolveTarget('ncu-test-v2', '^1.0.0', {})).toEqual(['latest', 'latest'])
  })

  it('passes through a string target', () => {
    expect(resolveTarget('ncu-test-v2', '^1.0.0', { target: 'minor' })).toEqual(['minor', 'latest'])
  })

  it('reads a leading @ as a dist-tag', () => {
    expect(resolveTarget('ncu-test-v2', '^1.0.0', { target: '@next' })).toEqual(['distTag', 'next'])
  })

  it('calls a target function with the package name and parsed range', () => {
    const target = resolveTarget('ncu-test-v2', '^1.0.0', {
      target: (name, semverRange) => {
        expect(name).toBe('ncu-test-v2')
        expect(semverRange[0].major).toBe('1')
        return 'patch'
      },
    })
    expect(target).toEqual(['patch', 'latest'])
  })

  it('reads a dist-tag returned by a target function', () => {
    expect(resolveTarget('ncu-test-v2', '^1.0.0', { target: () => '@beta' })).toEqual(['distTag', 'beta'])
  })
})
