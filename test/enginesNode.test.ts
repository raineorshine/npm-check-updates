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
          del: '3.0.0',
        },
      },
    })) as Index<VersionSpec>

    const versionNew = parseInt(upgraded.del, 10)
    versionNew.should.gt(4)
  })
})
