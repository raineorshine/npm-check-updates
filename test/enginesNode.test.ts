import ncu from '../src/'
import { type Index } from '../src/types/IndexType'
import { type MockedVersions } from '../src/types/MockedVersions'
import { type VersionSpec } from '../src/types/VersionSpec'
import stubVersions from './helpers/stubVersions'

describe('enginesNode', () => {
  let stub: { mockRestore: () => void }
  beforeEach(() => {
    stub = stubVersions({
      del: {
        version: '8.0.1',
        versions: {
          '8.0.1': { version: '8.0.1', engines: { node: '>=18.0.0' } },
          '5.1.0': { version: '5.1.0', engines: { node: '>=8' } },
          '4.1.1': { version: '4.1.1', engines: { node: '>=6' } },
          '4.1.0': { version: '4.1.0', engines: { node: '>=6' } },
          '4.0.0': { version: '4.0.1', engines: { node: '>=6' } },
          '3.0.0': { version: '3.0.0', engines: { node: '>=4' } },
        },
      },
      'ncu-test-v2': '2.0.0',
    } as MockedVersions)
  })
  afterEach(() => {
    stub.mockRestore()
  })

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

    upgraded!.should.eql({
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

    upgraded!.should.eql({})
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

    upgraded!.should.eql({
      'ncu-test-v2': '2.0.0',
    })
  })
})
