import { describe, expect, it } from 'vitest'
import getPackageJson from '../src/lib/getPackageJson.ts'

describe('getPackageJson', () => {
  it('loads the package.json of an installed dependency', async () => {
    const pkg = await getPackageJson('semver')
    expect(pkg?.name).toBe('semver')
    expect(typeof pkg?.version).toBe('string')
  })

  it('returns null when the package is not installed', async () => {
    expect(await getPackageJson('nonexistent-xyz-package-123')).toBeNull()
  })
})
