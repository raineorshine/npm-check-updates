import path from 'path'
import chai, { should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import * as yarn from '../../../src/package-managers/yarn'
import { Index } from '../../../src/types/IndexType'
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
    await yarn.list({ cwd: testDir }, localYarnSpawnOptions).should.eventually.be.rejectedWith(lockFileErrorMessage)
  })

  describe('setNpmAuthToken', () => {
    /** Run the test for the given registry server URL. */
    function testCore(npmRegistryServer: string): void {
      const npmConfig: Index<string | boolean> = { '@fortawesome:registry': 'https://npm.fontawesome.com/' }
      const dep = 'fortawesome'
      const scopedConfig: yarn.NpmScope = {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer,
      }

      yarn.setNpmAuthToken(npmConfig, [dep, scopedConfig])

      npmConfig['//npm.fontawesome.com/:_authToken'].should.equal('MY-AUTH-TOKEN')
    }

    it('npmRegistryServer does not have trailing slash', () => {
      testCore('https://npm.fontawesome.com')
    })

    it('npmRegistryServer has trailing slash', () => {
      testCore('https://npm.fontawesome.com/')
    })
  })
})

describe('getPathToLookForLocalYarnrc', () => {
  it('returns the correct path when using Yarn workspaces', () => {
    /** Mock for filesystem calls. */
    function readdirSyncMock(path: string): string[] {
      switch (path) {
        case '/home/test-repo/packages/package-a':
        case 'C:\\home\\test-repo\\packages\\package-a':
          return ['index.ts']
        case '/home/test-repo/packages':
        case 'C:\\home\\test-repo\\packages':
          return []
        case '/home/test-repo':
        case 'C:\\home\\test-repo':
          return ['yarn.lock']
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const yarnrcPath = getPathToLookForYarnrc(
      {
        cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
      },
      readdirSyncMock,
    )

    should().exist(yarnrcPath)
    yarnrcPath!.should.equal(isWindows ? 'C:\\home\\test-repo\\.yarnrc.yml' : '/home/test-repo/.yarnrc.yml')
  })
})
