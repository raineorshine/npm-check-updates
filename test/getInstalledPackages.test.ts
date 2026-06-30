import { describe, it } from 'vitest'
import getInstalledPackages from '../src/lib/getInstalledPackages.ts'

// test getInstalledPackages since we cannot test runGlobal without additional code for mocking
describe('getInstalledPackages', () => {
  it('execute npm ls', async () => {
    await getInstalledPackages()
  })
})
