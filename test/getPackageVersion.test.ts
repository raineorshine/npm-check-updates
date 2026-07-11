import { describe, expect, it } from 'vitest'
import getPackageVersion from '../src/lib/getPackageVersion.ts'

describe('getPackageVersion', () => {
  it('returns the version from a provided package.json object', async () => {
    expect(await getPackageVersion('foo', { version: '1.2.3' })).toBe('1.2.3')
  })

  it('returns null when the package cannot be found', async () => {
    expect(await getPackageVersion('this-package-does-not-exist-xyz-123')).toBeNull()
  })
})
