'use strict'

const mock = require('mock-require')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')

// mock spawn-please to use local yarn
// must be mocked before requiring packageManagers
mock('spawn-please', async (cmd, args, options) => {

  const isYarn = cmd === 'yarn' || cmd === 'yarn.cmd'

  // try command as normal
  let result
  try {
    result = await spawn(cmd, args, options)
  }
  catch (e) {
    // if yarn fails with ENOENT, try local yarn
    if (isYarn && e.code === 'ENOENT') {
      const localCmd = path.resolve(__dirname, '../../../node_modules/yarn/bin', cmd)
      result = await spawn(localCmd, args, options)
    }
    else {
      throw e
    }
  }

  return result
})
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
