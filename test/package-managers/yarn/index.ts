import mock from 'mock-require'
import path from 'path'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import spawn from 'spawn-please'

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

const yarn = require('../../../src/package-managers/yarn')

chai.should()
chai.use(chaiAsPromised)

describe('yarn', function () {

  it('list', async () => {
    const testDir = path.join(__dirname, 'default')
    const version = await yarn.latest('chalk', '', { cwd: testDir })
    parseInt(version!, 10).should.be.above(3)
  })

  it('latest', async () => {
    const testDir = path.join(__dirname, 'default')
    const version = await yarn.latest('chalk', '', { cwd: testDir })
    parseInt(version!, 10).should.be.above(3)
  })

  it('"No lockfile" error should be thrown on list command when there is no lockfile', async () => {
    const testDir = path.join(__dirname, 'nolockfile')
    const lockFileErrorMessage = 'No lockfile in this directory. Run `yarn install` to generate one.'
    await yarn.list({ cwd: testDir })
      .should.eventually.be.rejectedWith(lockFileErrorMessage)
  })

})
