import chai from 'chai'
import getPreferredWildcard from '../src/lib/getPreferredWildcard'

const should = chai.should()
process.env.NCU_TESTS = 'true'

describe('getPreferredWildcard', () => {

  it('identify ^ when it is preferred', () => {
    const deps = {
      async: '^0.9.0',
      bluebird: '^2.9.27',
      cint: '^8.2.1',
      commander: '~2.8.1',
      lodash: '^3.2.0'
    }
    getPreferredWildcard(deps)!.should.equal('^')
  })

  it('identify ~ when it is preferred', () => {
    const deps = {
      async: '~0.9.0',
      bluebird: '~2.9.27',
      cint: '^8.2.1',
      commander: '~2.8.1',
      lodash: '^3.2.0'
    }
    getPreferredWildcard(deps)!.should.equal('~')
  })

  it('identify .x when it is preferred', () => {
    const deps = {
      async: '0.9.x',
      bluebird: '2.9.x',
      cint: '^8.2.1',
      commander: '~2.8.1',
      lodash: '3.x'
    }
    getPreferredWildcard(deps)!.should.equal('.x')
  })

  it('identify .* when it is preferred', () => {
    const deps = {
      async: '0.9.*',
      bluebird: '2.9.*',
      cint: '^8.2.1',
      commander: '~2.8.1',
      lodash: '3.*'
    }
    getPreferredWildcard(deps)!.should.equal('.*')
  })

  it('do not allow wildcards to be outnumbered by non-wildcards', () => {
    const deps = {
      gulp: '^4.0.0',
      typescript: '3.3.0',
      webpack: '4.30.0'
    }
    getPreferredWildcard(deps)!.should.equal('^')
  })

  it('use the first wildcard if there is a tie', () => {
    const deps = {
      async: '0.9.x',
      commander: '2.8.*'
    }
    getPreferredWildcard(deps)!.should.equal('.x')
  })

  it('return null when it cannot be determined from other dependencies', () => {
    const deps = {
      async: '0.9.0',
      commander: '2.8.1',
      lodash: '3.2.0'
    }
    should.equal(getPreferredWildcard(deps), null)
    should.equal(getPreferredWildcard({}), null)
  })
})
