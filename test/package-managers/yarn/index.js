'use strict'

const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const packageManagers = require('../../../lib/package-managers')

chai.should()
chai.use(chaiAsPromised)

describe('yarn', function () {

  this.timeout(30000)

  it('list', async () => {
    const testDir = path.resolve(path.join(__dirname, './default'))
    const version = await packageManagers.yarn.latest('chalk', null, { cwd: testDir })
    parseInt(version, 10).should.be.above(3)
  })

  it('latest', async () => {
    const testDir = path.resolve(path.join(__dirname, './default'))
    const version = await packageManagers.yarn.latest('chalk', null, { cwd: testDir })
    parseInt(version, 10).should.be.above(3)
  })

  it('"No lockfile" error should be thrown on list command when there is no lockfile', async () => {
    const testDir = path.resolve(path.join(__dirname, './nolockfile'))
    const lockFileErrorMessage = 'No lockfile in this directory. Run `yarn install` to generate one.'
    await packageManagers.yarn.list({ cwd: testDir })
      .should.eventually.be.rejectedWith(lockFileErrorMessage)
  })

})
