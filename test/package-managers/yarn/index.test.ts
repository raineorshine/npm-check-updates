import path from 'path'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import * as yarn from '../../../src/package-managers/yarn'

chai.should()
chai.use(chaiAsPromised)
process.env.NCU_TESTS = 'true'

// append the local node_modules bin directory to process.env.PATH so local yarn is used during tests
const localBin = path.resolve(__dirname.replace('build/', ''), '../../../node_modules/.bin')
const localYarnSpawnOptions = {
  env: {
    ...process.env,
    PATH: `${process.env.PATH}:${localBin}`,
  }
}

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

  it('greatest', async () => {
    const version = await yarn.greatest('ncu-test-greatest-not-newest', '', { pre: true, cwd: __dirname })
    version!.should.equal('2.0.0-beta')
  })

  it('avoids deprecated', async () => {
    const testDir = path.join(__dirname, 'default')
    const version = await yarn.minor('popper.js', '1.15.0', { cwd: testDir, pre: true })
    version!.should.equal('1.16.1-lts')
  })

  it('"No lockfile" error should be thrown on list command when there is no lockfile', async () => {
    const testDir = path.join(__dirname, 'nolockfile')
    const lockFileErrorMessage = 'No lockfile in this directory. Run `yarn install` to generate one.'
    await yarn.list({ cwd: testDir }, localYarnSpawnOptions)
      .should.eventually.be.rejectedWith(lockFileErrorMessage)
  })

})
