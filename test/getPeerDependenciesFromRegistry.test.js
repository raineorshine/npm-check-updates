'use strict'

const chai = require('chai')
const getPeerDependenciesFromRegistry = require('../src/lib/getPeerDependenciesFromRegistry').default

chai.should()
process.env.NCU_TESTS = true

describe('getPeerDependenciesFromRegistry', function () {

  it('single package', async () => {
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-peer': '1.0' }, {})
    data.should.deep.equal({
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x'
      }
    })
  })

  it('single package empty', async () => {
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-return-version': '1.0' }, {})
    data.should.deep.equal({ 'ncu-test-return-version': {} })
  })

  it('multiple packages', async () => {
    const data = await getPeerDependenciesFromRegistry({
      'ncu-test-return-version': '1.0.0',
      'ncu-test-peer': '1.0.0',
    }, {})
    data.should.deep.equal({
      'ncu-test-return-version': {},
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x'
      }
    })
  })

})
