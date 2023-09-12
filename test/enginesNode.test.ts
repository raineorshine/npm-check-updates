import chai from 'chai'
import ncu from '../src/'
import { Index } from '../src/types/IndexType'
import { VersionSpec } from '../src/types/VersionSpec'

chai.should()
process.env.NCU_TESTS = 'true'

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
