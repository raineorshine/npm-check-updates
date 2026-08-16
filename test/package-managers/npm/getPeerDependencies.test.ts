import { describe, expect, it } from 'vitest'
import * as npm from '../../../src/package-managers/npm.ts'

describe('getPeerDependencies', () => {
  it('reads the peer dependencies of an exact version', async () => {
    await expect(npm.getPeerDependencies('ncu-test-peer', '1.0.0')).resolves.toStrictEqual({
      'ncu-test-return-version': '1.x',
    })
  })

  // the highest matching version wins, the same as `npm view pkg@range peerDependencies`
  it('resolves a range to the highest matching version', async () => {
    await expect(npm.getPeerDependencies('ncu-test-peer', '^1.0.0')).resolves.toStrictEqual({
      'ncu-test-return-version': '1.x',
    })
  })

  it('returns {} when the package has no peer dependencies', async () => {
    await expect(npm.getPeerDependencies('ncu-test-return-version', '1.0.0')).resolves.toStrictEqual({})
  })

  it('rejects when the package does not exist', async () => {
    await expect(npm.getPeerDependencies('fffffffffffff', '1.0.0')).rejects.toThrow()
  })
})
