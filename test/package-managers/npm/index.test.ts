import * as npm from '../../../src/package-managers/npm'
import chaiSetup from '../../helpers/chaiSetup'

chaiSetup()

describe('npm', function () {
  it('list', async () => {
    const versionObject = await npm.list({ cwd: __dirname })
    versionObject.should.have.property('express')
  })

  it('latest', async () => {
    const { version } = await npm.latest('express', '', { cwd: __dirname })
    parseInt(version!, 10).should.be.above(1)
  })

  it('greatest', async () => {
    const { version } = await npm.greatest('ncu-test-greatest-not-newest', '', { pre: true, cwd: __dirname })
    version!.should.equal('2.0.0-beta')
  })

  it('ownerChanged', async () => {
    await npm.packageAuthorChanged('mocha', '^7.1.0', '8.0.1').should.eventually.equal(true)
    await npm.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0').should.eventually.equal(false)
    await npm.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0').should.eventually.equal(false)
  })

  it('getPeerDependencies', async () => {
    await npm.getPeerDependencies('ncu-test-return-version', '1.0.0').should.eventually.deep.equal({})
    await npm.getPeerDependencies('ncu-test-peer', '1.0.0').should.eventually.deep.equal({
      'ncu-test-return-version': '1.x',
    })
  })

  it('getEngines', async () => {
    await npm.getEngines('del', '2.0.0').should.eventually.deep.equal({ node: '>=0.10.0' })
    await npm.getEngines('ncu-test-return-version', '1.0.0').should.eventually.deep.equal({})
    await npm
      .getEngines('ncu-test-return-version', '1.0')
      .should.eventually.be.rejectedWith('404 Not Found - GET https://registry.npmjs.org/ncu-test-return-version/1.0')
  })
})
