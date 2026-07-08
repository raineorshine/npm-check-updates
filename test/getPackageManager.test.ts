import { describe, expect, it } from 'vitest'
import getPackageManager from '../src/lib/getPackageManager.ts'
import packageManagers from '../src/package-managers/index.ts'

describe('getPackageManager', () => {
  it('defaults to npm when no name is given or the name is deno', () => {
    expect(getPackageManager({}, undefined)).toBe(packageManagers.npm)
    expect(getPackageManager({}, 'deno')).toBe(packageManagers.npm)
  })

  it('returns the static registry when registryType is json', () => {
    expect(getPackageManager({ registryType: 'json' }, 'npm')).toBe(packageManagers.staticRegistry)
  })

  it('returns the named package manager', () => {
    expect(getPackageManager({}, 'yarn')).toBe(packageManagers.yarn)
  })

  it('throws on an invalid package manager', () => {
    expect(() => getPackageManager({}, 'bogus')).toThrow('Invalid package manager: bogus')
  })
})
