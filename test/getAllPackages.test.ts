import chai from 'chai'
import path from 'path'
import getAllPackages from '../src/lib/getAllPackages'
import { Options } from '../src/types/Options'

chai.should()

/** given a dirPath removes it from a tuple of strings  */
async function stripDir(dirPath: string, paths: [string[], string[]]): Promise<[string[], string[]]> {
  const [pkgs, workspacePackages]: [string[], string[]] = paths
  return [
    pkgs.map((path: string): string => path.replace(dirPath, '')),
    workspacePackages.map((path: string): string => path.replace(dirPath, '')),
  ]
}

/** convenience function to call getAllPackages for a given test-path  */
async function getAllPackagesForTest(testPath: string, options: Options): Promise<[string[], string[]]> {
  const testCwd = path.join(__dirname, testPath)
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

  describe('basic npm package', () => {
    it('handles tradition flat npm project ', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest('test-data/basic/', {})
      pkgs.should.deep.equal(['package.json'])
      workspacePackages.should.deep.equal([])
    })

    it('errors in non-workspace project with --workspaces option', async () => {
      await getAllPackagesForTest('test-data/basic/', {
        workspaces: true,
      }).should.be.rejectedWith('workspaces property missing')
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
        'test-data/workspace_basic/',
        { root: true, workspaces: true },
      )

      // with --root should return root package and the sub-package
      pkgs.should.deep.equal(['package.json', 'pkg/sub/package.json'])
      workspacePackages.should.deep.equal(['basic-sub-package'])
    })
  })
})
