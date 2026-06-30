import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type VersionSpec } from '../src/types/VersionSpec.ts'

describe('enginesNode', () => {
  it("update packages that satisfy the project's engines.node", async () => {
    const upgraded = await ncu({
      enginesNode: true,
      packageData: {
        dependencies: {
          del: '3.0.0',
        },
        engines: {
          node: '>=6',
        },
      },
    })

    expect(upgraded).toStrictEqual({
      del: '4.1.1',
    })
  })

  it('do not update packages with incompatible engines.node', async () => {
    const upgraded = await ncu({
      enginesNode: true,
      packageData: {
        dependencies: {
          del: '3.0.0',
        },
        engines: {
          node: '>=1',
        },
      },
    })

    expect(upgraded).toStrictEqual({})
  })

  it('update packages that do not have engines.node', async () => {
    const upgraded = (await ncu({
      enginesNode: true,
      packageData: {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
        engines: {
          node: '>=6',
        },
      },
    })) as Index<VersionSpec>

    expect(upgraded).toStrictEqual({
      'ncu-test-v2': '2.0.0',
    })
  })
})
