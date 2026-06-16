import fs from 'fs/promises'
import os from 'os'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import * as yarn from '../../../src/package-managers/yarn'
import { getPathToLookForYarnrc, yarnApi } from '../../../src/package-managers/yarn'
import chaiSetup from '../../helpers/chaiSetup'

const should = chaiSetup()
const __dirname = dirname(fileURLToPath(import.meta.url))

const isWindows = process.platform === 'win32'

// append the local node_modules bin directory to process.env.PATH so local yarn is used during tests
const localBin = path.resolve(__dirname.replace('build/', ''), '../../../node_modules/.bin')
const localYarnSpawnOptions = {
  env: {
    ...process.env,
    PATH: `${process.env.PATH}:${localBin}`,
  },
}

const filteredPath = (process.env.PATH || '')
  .split(path.delimiter)
  .filter(p => !p.includes(path.join('node_modules', '.bin'))) // Avoid running yarn form the node module bin
  .join(path.delimiter)
// `corepack enable yarn` (run in CI before the tests) installs the corepack-managed yarn shim in the
// directory of the running node binary. Prepend that directory so the v4 project resolves corepack's
// yarn 4 rather than a globally pre-installed yarn classic. yarn classic refuses to run when
// package.json pins `packageManager: yarn@4` ("the current global version of Yarn is 1.22.22"),
// producing an empty result and an empty peerDependencies. This is what broke getPeerDependencies v4 on
// Node 26 windows-latest, where the runner's global yarn was resolved ahead of the corepack shim.
// A single PATH key (no case-variant Path/PATH duplicate) is kept because Node 26 on Windows resolves
// such duplicates unpredictably for spawned processes.
const nodeBinDir = path.dirname(process.execPath)
const cleanEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')),
  PATH: [nodeBinDir, filteredPath].filter(Boolean).join(path.delimiter),
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

  it('getPeerDependencies v1', async () => {
    const testDir = path.join(__dirname, 'default')
    const spawnOptions = { cwd: testDir, env: cleanEnv }
    await yarn.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions).should.eventually.deep.equal({})
    await yarn.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions).should.eventually.deep.equal({
      'ncu-test-return-version': '1.x',
    })
    await yarn.getPeerDependencies('fffffffffffff', '1.0.0', spawnOptions).should.eventually.deep.equal({})
  })

  it('getPeerDependencies v4', async () => {
    const testDir = path.join(__dirname, 'v4')
    const spawnOptions = { cwd: testDir, env: cleanEnv }
    await yarn.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions).should.eventually.deep.equal({})
    await yarn.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions).should.eventually.deep.equal({
      'ncu-test-return-version': '1.x',
    })
    await yarn.getPeerDependencies('fffffffffffff', '1.0.0', spawnOptions).should.eventually.deep.equal({})
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

    it('returns null when no npmAlwaysAuth', () => {
      const authToken = yarn.npmAuthTokenKeyValue({}, 'fortawesome', {
        npmAlwaysAuth: true,
        // undefined: npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer: 'https://npm.fontawesome.com/',
      })

      should.equal(authToken, null)
    })

    it('returns null when no registry server', () => {
      const authToken = yarn.npmAuthTokenKeyValue({}, 'fortawesome', {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        // undefined: npmRegistryServer: 'https://npm.fontawesome.com/',
      })

      should.equal(authToken, null)
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

      should.exist(yarnrcPath)
      yarnrcPath!.should.equal(isWindows ? 'C:\\home\\test-repo\\.yarnrc.yml' : '/home/test-repo/.yarnrc.yml')
    })
  })

  describe('getYarnMinimalAgeGate', () => {
    /** Creates a temp directory with a yarn.lock and a .yarnrc.yml for testing. */
    async function createTempYarnrc(yarnrcContent: string): Promise<{ tempDir: string; cleanup: () => Promise<void> }> {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-yarn-agegate-'))
      await fs.writeFile(path.join(tempDir, 'yarn.lock'), '')
      await fs.writeFile(path.join(tempDir, '.yarnrc.yml'), yarnrcContent)
      return {
        tempDir,
        cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
      }
    }

    it('parses a numeric npmMinimalAgeGate (minutes) from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: 1440\n')
      try {
        const result = await yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        should.exist(result)
        result!.npmMinimalAgeGate.should.equal(1440)
        result!.npmPreapprovedPackages.should.deep.equal([])
      } finally {
        await cleanup()
      }
    })

    it('parses a duration string npmMinimalAgeGate ("3d") from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: "3d"\n')
      try {
        const result = await yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        should.exist(result)
        // "3d" → 3 days → 3 * 1440 = 4320 minutes
        result!.npmMinimalAgeGate.should.equal(3 * 1440)
        result!.npmPreapprovedPackages.should.deep.equal([])
      } finally {
        await cleanup()
      }
    })

    it('parses a duration string npmMinimalAgeGate ("12h") from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: "12h"\n')
      try {
        const result = await yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        should.exist(result)
        // "12h" → 12/24 days → 0.5 * 1440 = 720 minutes
        result!.npmMinimalAgeGate.should.equal(720)
        result!.npmPreapprovedPackages.should.deep.equal([])
      } finally {
        await cleanup()
      }
    })

    it('returns null for an invalid duration string from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: "invalid"\n')
      try {
        const result = await yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        should.not.exist(result)
      } finally {
        await cleanup()
      }
    })

    it('parses npmMinimalAgeGate with npmPreapprovedPackages from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc(
        'npmMinimalAgeGate: "7d"\nnpmPreapprovedPackages:\n  - "@my-org/*"\n',
      )
      try {
        const result = await yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        should.exist(result)
        // "7d" → 7 * 1440 = 10080 minutes
        result!.npmMinimalAgeGate.should.equal(7 * 1440)
        result!.npmPreapprovedPackages.should.deep.equal(['@my-org/*'])
      } finally {
        await cleanup()
      }
    })
  })
})
