import chai from 'chai'
import determinePackageManager from '../src/lib/determinePackageManager'

chai.should()

const isWindows = process.platform === 'win32'

describe('determinePackageManager', () => {
  it('returns options.packageManager if set', async () => {
    const packageManager = await determinePackageManager({ packageManager: 'fake' })
    packageManager.should.equal('fake')
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
})
