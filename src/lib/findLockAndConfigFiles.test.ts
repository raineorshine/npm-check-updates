import chai, { should } from 'chai'
import { determinePackageManager, getPathToLookForYarnrc } from './findLockAndConfigFiles'

chai.should()

describe('determinePackageManager', () => {
  it('returns options.packageManager if set', () => {
    determinePackageManager({ packageManager: 'fake' }).should.equal('fake')
  })

  it('returns yarn if yarn.lock exists in cwd', () => {
    /** Mock for filesystem calls. */
    function readdirSyncMock(path: string): string[] {
      switch (path) {
        case '/home/test-repo':
          return ['yarn.lock']
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    determinePackageManager(
      {
        cwd: '/home/test-repo',
      },
      readdirSyncMock,
    ).should.equal('yarn')
  })

  it('returns yarn if yarn.lock exists in an ancestor directory', () => {
    /** Mock for filesystem calls. */
    function readdirSyncMock(path: string): string[] {
      switch (path) {
        case '/home/test-repo/packages/package-a':
          return ['index.ts']
        case '/home/test-repo/packages':
          return []
        case '/home/test-repo':
          return ['yarn.lock']
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    determinePackageManager(
      {
        cwd: '/home/test-repo/packages/package-a',
      },
      readdirSyncMock,
    ).should.equal('yarn')
  })

  it('returns npm if package-lock.json found before yarn.lock', () => {
    /** Mock for filesystem calls. */
    function readdirSyncMock(path: string): string[] {
      switch (path) {
        case '/home/test-repo/packages/package-a':
          return ['index.ts']
        case '/home/test-repo/packages':
          return ['package-lock.json']
        case '/home/test-repo':
          return ['yarn.lock']
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    determinePackageManager(
      {
        cwd: '/home/test-repo/packages/package-a',
      },
      readdirSyncMock,
    ).should.equal('npm')
  })

  it('does not loop infinitely if no lockfile found', () => {
    /** Mock for filesystem calls. */
    function readdirSyncMock(): string[] {
      return []
    }

    determinePackageManager(
      {
        cwd: '/home/test-repo/packages/package-a',
      },
      readdirSyncMock,
    ).should.equal('npm')
  })
})

describe('getPathToLookForLocalYarnrc', () => {
  it('returns the correct path when using Yarn workspaces', () => {
    /** Mock for filesystem calls. */
    function readdirSyncMock(path: string): string[] {
      switch (path) {
        case '/home/test-repo/packages/package-a':
          return ['index.ts']
        case '/home/test-repo/packages':
          return []
        case '/home/test-repo':
          return ['yarn.lock']
      }

      throw new Error(`Mock cannot handle path: ${path}.`)
    }

    const yarnrcPath = getPathToLookForYarnrc(
      {
        cwd: '/home/test-repo/packages/package-a',
      },
      readdirSyncMock,
    )

    should().exist(yarnrcPath)
    yarnrcPath!.should.equal('/home/test-repo/.yarnrc.yml')
  })
})
