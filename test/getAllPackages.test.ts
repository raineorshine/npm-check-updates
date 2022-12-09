import chai from 'chai'
import path from 'path'
import getAllPackages from '../src/lib/getAllPackages'
import { Options } from '../src/types/Options'

chai.should()

/** forces path to a posix version (windows-style) */
function asPosixPath(filepath: string): string {
  return filepath.split(path.sep).join(path.posix.sep)
}

/** given a dirPath removes it from a tuple of strings  */
async function stripDir(dirPath: string, paths: [string[], string[]]): Promise<[string[], string[]]> {
  const [pkgs, workspacePackages]: [string[], string[]] = paths
  return [
    pkgs.map((path: string): string => asPosixPath(path).replace(dirPath, '')),
    workspacePackages.map((path: string): string => asPosixPath(path).replace(dirPath, '')),
  ]
}

/** convenience function to call getAllPackages for a given test-path  */
async function getAllPackagesForTest(testPath: string, options: Options): Promise<[string[], string[]]> {
  const testCwd = path.join(__dirname, testPath).replace(/\\/g, '/')
  process.chdir(testCwd) // FIXME: remove the setting of cwd, the tests should work without it
  const optionsWithTestCwd: Options = { cwd: testCwd, ...options }
  const [pkgs, workspacePackages]: [string[], string[]] = await stripDir(
    testCwd,
    await getAllPackages(optionsWithTestCwd),
  )
  return [pkgs, workspacePackages]
}

describe('getAllPackages', () => {
  let originalCwd = process.cwd()
  beforeEach(() => {
    // FIXME: delete me
    originalCwd = process.cwd()
  })

  afterEach(() => {
    // FIXME: delete me
    process.chdir(originalCwd)
  })

  it('returns default package without cwd ', async () => {
    const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackages({})
    pkgs.should.deep.equal(['package.json'])
    workspacePackages.should.deep.equal([])
  })

  describe('basic npm package', () => {
    it('handles tradition flat npm project ', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest('test-data/basic/', {})
      pkgs.should.deep.equal(['package.json'])
      workspacePackages.should.deep.equal([])
    })

    it('errors in non-workspace project with --workspaces option', async () => {
      await getAllPackagesForTest('test-data/basic/', {
        workspaces: true,
      }).should.be.rejectedWith('workspaces property missing from package.json. --workspaces')
    })

    it('errors in non-workspace project with --workspace=<name> option', async () => {
      await getAllPackagesForTest('test-data/basic/', {
        workspace: ['basic-sub-package'],
      }).should.be.rejectedWith('workspaces property missing from package.json. --workspace')
    })
  })

  describe('basic workspace project', () => {
    it('handles simple workspace without --workspaces option', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        {},
      )
      pkgs.should.deep.equal(['package.json'])
      workspacePackages.should.deep.equal([])
    })

    it('handles simple workspace with --workspaces option', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        { workspaces: true },
      )

      // without --root should just return the sub-package
      pkgs.should.deep.equal(['pkg/sub/package.json'])
      workspacePackages.should.deep.equal(['basic-sub-package'])
    })

    it('handles simple workspace with --workspaces and --root option', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        { root: true, workspaces: true },
      )

      // with --root should return root package and the sub-package
      pkgs.should.deep.equal(['package.json', 'pkg/sub/package.json'])
      workspacePackages.should.deep.equal(['basic-sub-package'])
    })

    it('handles simple workspace with --workspaces=false', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        { workspaces: false },
      )

      // with workspaces=false should return just the root package, no sub-packages,
      // when inside a workspace project
      pkgs.should.deep.equal(['package.json'])
      workspacePackages.should.deep.equal([])
    })

    describe('--workspace="<string>"', () => {
      it('handles simple workspace with --workspace="basic-sub-package"', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspace: ['basic-sub-package'] },
        )

        // with --root should return root package and the sub-package
        pkgs.should.deep.equal([])
        workspacePackages.should.deep.equal(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces and --workspace="basic-sub-package"', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspaces: true, workspace: ['basic-sub-package'] },
        )

        pkgs.should.deep.equal(['pkg/sub/package.json'])
        workspacePackages.should.deep.equal(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces, --workspace="basic-sub-package", and --root option', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { root: true, workspaces: true, workspace: ['basic-sub-package'] },
        )

        // with --root should return root package and the sub-package
        pkgs.should.deep.equal(['package.json', 'pkg/sub/package.json'])
        workspacePackages.should.deep.equal(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces and --workspace=<empty>', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspaces: true, workspace: [] },
        )

        pkgs.should.deep.equal(['pkg/sub/package.json'])
        workspacePackages.should.deep.equal(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces=false and  --workspace="basic-sub-package"', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspaces: false, workspace: ['basic-sub-package'] },
        )

        // with --workspaces=false should return no packages but the workspace name
        // when --workspace="X" given.
        // FIXME: explain WHY this exists and what the use-case is for, it's unclear
        // from the code.
        pkgs.should.deep.equal([])
        workspacePackages.should.deep.equal(['basic-sub-package'])
      })
    })
  })

  describe('empty workspace project', () => {
    describe('package.workspaces is empty array', () => {
      it('should return empty data for empty workspaces', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-workspace-param-is-array/',
          { workspaces: true },
        )

        pkgs.should.deep.equal([])
        workspacePackages.should.deep.equal([])
      })
    })

    describe('package.workspaces is object and package.workspaces.packages is empty array', () => {
      it('should return empty data for empty workspaces', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-no-sub-packages/',
          { workspaces: true },
        )

        pkgs.should.deep.equal([])
        workspacePackages.should.deep.equal([])
      })
    })

    describe('sub-package-names', () => {
      it('FIXME: --workspaces should return all packages not just ones that dir-names-match', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-sub-package-names/',
          { workspaces: true },
        )

        pkgs.should.deep.equal(['pkg/dirname-matches-name/package.json', 'pkg/dirname-will-become-name/package.json'])
        workspacePackages.should.deep.equal([
          'dirname-matches-name',
          'dirname-will-become-name', // should use the directory name
          // 'dirname-does-not-match-name',  FIXME: this should be returned too
        ])
      })

      it('FIXME: --workspace should return all named packages not just ones that dir-names-match', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-sub-package-names/',
          {
            workspaces: false,
            workspace: [
              'dirname-matches-name',
              'dirname-will-become-name',
              // 'dirname-does-not-match-name',  FIXME: this should be returned too
            ],
          },
        )

        pkgs.should.deep.equal(['pkg/dirname-matches-name/package.json', 'pkg/dirname-will-become-name/package.json'])
        workspacePackages.should.deep.equal([
          'dirname-matches-name',
          'dirname-will-become-name',
          // 'dirname-does-not-match-name',  FIXME: this should be returned too
        ])
      })
    })
  })
})
