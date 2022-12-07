import chai, { should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import path from 'path'
import * as yarn from '../../../src/package-managers/yarn'
import { getPathToLookForYarnrc } from '../../../src/package-managers/yarn'

chai.should()
chai.use(chaiAsPromised)
process.env.NCU_TESTS = 'true'

const isWindows = process.platform === 'win32'

// append the local node_modules bin directory to process.env.PATH so local yarn is used during tests
const localBin = path.resolve(__dirname.replace('build/', ''), '../../../node_modules/.bin')
const localYarnSpawnOptions = {
  env: {
    ...process.env,
    PATH: `${process.env.PATH}:${localBin}`,
  },
}

describe('yarn', function () {
  it('list', async () => {
    const testDir = path.join(__dirname, 'default')
    const { version } = await yarn.latest('chalk', '', { cwd: testDir })
    parseInt(version!, 10).should.be.above(3)
  })

  it('latest', async () => {
    const testDir = path.join(__dirname, 'default')
    const { version } = await yarn.latest('chalk', '', { cwd: testDir })
    parseInt(version!, 10).should.be.above(3)
  })

  it('greatest', async () => {
    const { version } = await yarn.greatest('ncu-test-greatest-not-newest', '', { pre: true, cwd: __dirname })
    version!.should.equal('2.0.0-beta')
  })

  it('avoids deprecated', async () => {
    const testDir = path.join(__dirname, 'default')
    const { version } = await yarn.minor('popper.js', '1.15.0', { cwd: testDir, pre: true })
    version!.should.equal('1.16.1-lts')
  })

  it('"No lockfile" error should be thrown on list command when there is no lockfile', async () => {
    const testDir = path.join(__dirname, 'nolockfile')
    const lockFileErrorMessage = 'No lockfile in this directory. Run `yarn install` to generate one.'
    await yarn.list({ cwd: testDir }, localYarnSpawnOptions).should.eventually.be.rejectedWith(lockFileErrorMessage)
  })

  describe('npmAuthTokenKeyValue', () => {
    it('npmRegistryServer with trailing slash', () => {
      const authToken = yarn.npmAuthTokenKeyValue({}, 'fortawesome', {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer: 'https://npm.fontawesome.com/',
      })

      authToken!.should.deep.equal({
        '//npm.fontawesome.com/:_authToken': 'MY-AUTH-TOKEN',
      })
    })

    it('npmRegistryServer without trailing slash', () => {
      const authToken = yarn.npmAuthTokenKeyValue({}, 'fortawesome', {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer: 'https://npm.fontawesome.com',
      })

      authToken!.should.deep.equal({
        '//npm.fontawesome.com/:_authToken': 'MY-AUTH-TOKEN',
      })
    })
  })
})

describe('getPathToLookForLocalYarnrc', () => {
  it('returns the correct path when using Yarn workspaces', async () => {
    /** Mock for filesystem calls. */
    function readdirMock(path: string): Promise<string[]> {
      switch (path) {
        case '/home/test-repo/packages/package-a':
        case 'C:\\home\\test-repo\\packages\\package-a':
          return Promise.resolve(['index.ts'])
        case '/home/test-repo/packages':
        case 'C:\\home\\test-repo\\packages':
          return Promise.resolve([])
        case '/home/test-repo':
        case 'C:\\home\\test-repo':
          return Promise.resolve(['yarn.lock'])
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const yarnrcPath = await getPathToLookForYarnrc(
      {
        cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
      },
      readdirMock,
    )

    should().exist(yarnrcPath)
    yarnrcPath!.should.equal(isWindows ? 'C:\\home\\test-repo\\.yarnrc.yml' : '/home/test-repo/.yarnrc.yml')
  })
})
