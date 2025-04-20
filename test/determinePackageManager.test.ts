import { describe } from 'node:test'
import determinePackageManager from '../src/lib/determinePackageManager'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

const isWindows = process.platform === 'win32'

describe('determinePackageManager', () => {
  it('returns bun if bun.lockb exists in cwd', async () => {
    /** Mock for filesystem calls. */
    function readdirMock(path: string): Promise<string[]> {
      switch (path) {
        case '/home/test-repo':
        case 'C:\\home\\test-repo':
          return Promise.resolve(['bun.lockb'])
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo' : '/home/test-repo',
      },
      readdirMock,
    )
    packageManager.should.equal('bun')
  })

  it('returns bun if bun.lock exists in cwd', async () => {
    /** Mock for filesystem calls. */
    function readdirMock(path: string): Promise<string[]> {
      switch (path) {
        case '/home/test-repo':
        case 'C:\\home\\test-repo':
          return Promise.resolve(['bun.lock'])
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo' : '/home/test-repo',
      },
      readdirMock,
    )
    packageManager.should.equal('bun')
  })

  it('returns bun if bun.lockb exists in an ancestor directory', async () => {
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
          return Promise.resolve(['bun.lockb'])
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
      },
      readdirMock,
    )
    packageManager.should.equal('bun')
  })

  it('returns yarn if yarn.lock exists in cwd', async () => {
    /** Mock for filesystem calls. */
    function readdirMock(path: string): Promise<string[]> {
      switch (path) {
        case '/home/test-repo':
        case 'C:\\home\\test-repo':
          return Promise.resolve(['yarn.lock'])
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo' : '/home/test-repo',
      },
      readdirMock,
    )
    packageManager.should.equal('yarn')
  })

  it('returns yarn if yarn.lock exists in an ancestor directory', async () => {
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

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
      },
      readdirMock,
    )
    packageManager.should.equal('yarn')
  })

  it('returns npm if package-lock.json found before yarn.lock', async () => {
    /** Mock for filesystem calls. */
    function readdirMock(path: string): Promise<string[]> {
      switch (path) {
        case '/home/test-repo/packages/package-a':
        case 'C:\\home\\test-repo\\packages\\package-a':
          return Promise.resolve(['index.ts'])
        case '/home/test-repo/packages':
        case 'C:\\home\\test-repo\\packages':
          return Promise.resolve(['package-lock.json'])
        case '/home/test-repo':
        case 'C:\\home\\test-repo':
          return Promise.resolve(['yarn.lock'])
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
      },
      readdirMock,
    )
    packageManager.should.equal('npm')
  })

  it('does not loop infinitely if no lockfile found', async () => {
    /** Mock for filesystem calls. */
    function readdirMock(): Promise<string[]> {
      return Promise.resolve([])
    }

    const packageManager = await determinePackageManager(
      {
        cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
      },
      readdirMock,
    )
    packageManager.should.equal('npm')
  })

  describe('global', () => {
    it('detects npm', async () => {
      const oldUserAgent = process.env.npm_config_user_agent
      const oldExecpath = process.env.npm_execpath

      process.env.npm_config_user_agent = 'bun/1.2.10'
      process.env.npm_execpath = 'bun'
      process.versions.bun = '1.2.10'

      const packageManager = await determinePackageManager({
        global: true,
      })
      packageManager.should.equal('bun')

      process.env.npm_config_user_agent = oldUserAgent
      process.env.npm_execpath = oldExecpath
      process.versions.bun = ''
    })

    it('detects yarn', async () => {
      const oldUserAgent = process.env.npm_config_user_agent
      const oldExecpath = process.env.npm_execpath

      process.env.npm_config_user_agent = 'yarn/1.2.10'
      process.env.npm_execpath = 'yarn'

      const packageManager = await determinePackageManager({
        global: true,
      })
      packageManager.should.equal('yarn')

      process.env.npm_config_user_agent = oldUserAgent
      process.env.npm_execpath = oldExecpath
    })

    it('detects pnpm', async () => {
      const oldUserAgent = process.env.npm_config_user_agent
      const oldExecpath = process.env.npm_execpath

      process.env.npm_config_user_agent = 'pnpm/1.2.10'
      process.env.npm_execpath = 'pnpm'

      const packageManager = await determinePackageManager({
        global: true,
      })
      packageManager.should.equal('pnpm')

      process.env.npm_config_user_agent = oldUserAgent
      process.env.npm_execpath = oldExecpath
    })

    it('defaults to npm', async () => {
      const oldUserAgent = process.env.npm_config_user_agent
      const oldExecpath = process.env.npm_execpath

      process.env.npm_config_user_agent = ''
      process.env.npm_execpath = ''

      const packageManager = await determinePackageManager({
        global: true,
      })
      packageManager.should.equal('npm')

      process.env.npm_config_user_agent = oldUserAgent
      process.env.npm_execpath = oldExecpath
    })
  })
})
