import chai from 'chai'
import * as ncu from '../src/index'
import { Index, VersionSpec } from '../src/types'

chai.should()
process.env.NCU_TESTS = 'true'

describe('enginesNode', () => {
  it('enable --enginesNode matching ', async () => {
    const upgradedPkg = await ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        },
        engines: {
          node: '>=6'
        }
      }),
      enginesNode: true
    })

    upgradedPkg!.should.eql({
      dependencies: {
        del: '4.1.1'
      },
      engines: {
        node: '>=6'
      }
    })
  })

  it('enable engines matching if --enginesNode', async () => {
    const upgradedPkg = await ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        },
        engines: {
          node: '>=6'
        }
      }),
      enginesNode: true
    })

    upgradedPkg!.should.have.property('dependencies')
    const deps = upgradedPkg!.dependencies as Index<VersionSpec>
    deps.should.have.property('del')
    deps.del.should.equal('4.1.1')
  })

  it('enable engines matching if --enginesNode, not update if matches not exists', async () => {
    const upgradedPkg = await ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        },
        engines: {
          node: '>=1'
        }
      }),
      enginesNode: true
    })

    upgradedPkg!.should.have.property('dependencies')
    const deps = upgradedPkg!.dependencies as Index<VersionSpec>
    deps.should.have.property('del')
    deps.del.should.equal('3.0.0')
  })

  it('enable engines matching if --enginesNode, update to latest version if engines.node not exists', async () => {
    const upgradedPkg = await ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        }
      }),
      enginesNode: true
    })

    upgradedPkg!.should.have.property('dependencies')
    const deps = upgradedPkg!.dependencies as Index<VersionSpec>
    deps.should.have.property('del')
    deps.del.should.not.equal('3.0.0')
    deps.del.should.not.equal('4.1.1')
  })

})
