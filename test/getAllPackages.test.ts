import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import getAllPackages from '../src/lib/getAllPackages.ts'
import { type Options } from '../src/types/Options.ts'
import { type PackageInfo } from '../src/types/PackageInfo.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Forces path to a posix version (windows-style). */
function asPosixPath(filepath: string): string {
  return filepath.split(path.sep).join(path.posix.sep)
}

/** Given a dirPath, removes it from a tuple of strings. */
async function stripDir(dirPath: string, paths: [string[], string[]]): Promise<[string[], string[]]> {
  const [pkgs, workspacePackages]: [string[], string[]] = paths
  return [
    pkgs.map((path: string): string => asPosixPath(path).replace(dirPath, '')),
    workspacePackages.map((path: string): string => asPosixPath(path).replace(dirPath, '')),
  ]
}

/** Convenience function to call getAllPackages for a given test-path. */
async function getAllPackagesForTest(testPath: string, options: Options): Promise<[string[], string[]]> {
  const testCwd = path.join(__dirname, testPath).replace(/\\/g, '/')
  const optionsWithTestCwd: Options = { cwd: testCwd, ...options }
  const [pkgInfos, workspacePackageNames]: [PackageInfo[], string[]] = await getAllPackages(optionsWithTestCwd)
  const packagePaths: string[] = pkgInfos.map((packageInfo: PackageInfo) => packageInfo.filepath)
  const [pkgs, workspacePackages]: [string[], string[]] = await stripDir(testCwd, [packagePaths, workspacePackageNames])
  return [pkgs, workspacePackages]
}

describe('getAllPackages', () => {
  it('returns default package without cwd', async () => {
    const [pkgInfos, workspacePackageNames]: [PackageInfo[], string[]] = await getAllPackages({})
    const packagePaths: string[] = pkgInfos.map((packageInfo: PackageInfo) => packageInfo.filepath)
    expect(packagePaths).toStrictEqual(['package.json'])
    // expect(allPackageInfos[0].name).toBeUndefined()
    expect(workspacePackageNames).toStrictEqual([])
  })

  describe('basic npm package', () => {
    it('handles tradition flat npm project ', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest('test-data/basic/', {})
      expect(pkgs).toStrictEqual(['package.json'])
      expect(workspacePackages).toStrictEqual([])
    })

    it('errors in non-workspace project with --workspaces option', async () => {
      await expect(
        getAllPackagesForTest('test-data/basic/', {
          workspaces: true,
        }),
      ).rejects.toThrow('workspaces property missing from package.json. --workspaces')
    })

    it('errors in non-workspace project with --workspace=<name> option', async () => {
      await expect(
        getAllPackagesForTest('test-data/basic/', {
          workspace: ['basic-sub-package'],
        }),
      ).rejects.toThrow('workspaces property missing from package.json. --workspace')
    })
  })

  describe('basic workspace project', () => {
    it('handles simple workspace without --workspaces option', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        {},
      )
      expect(pkgs).toStrictEqual(['package.json'])
      expect(workspacePackages).toStrictEqual([])
    })

    it('handles simple workspace with --workspaces option', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        { workspaces: true },
      )

      // without --root should just return the sub-package
      expect(pkgs).toStrictEqual(['pkg/sub/package.json'])
      expect(workspacePackages).toStrictEqual(['basic-sub-package'])
    })

    it('handles simple workspace with --workspaces and --packageFile pointing outside cwd', async () => {
      const workspaceRoot = path.join(__dirname, 'test-data/workspace-basic')
      const [pkgInfos, workspacePackageNames]: [PackageInfo[], string[]] = await getAllPackages({
        packageFile: path.join(workspaceRoot, 'package.json'),
        workspaces: true,
      })
      const packagePaths = pkgInfos.map((info: PackageInfo) =>
        asPosixPath(info.filepath).replace(asPosixPath(workspaceRoot) + '/', ''),
      )
      expect(packagePaths).toStrictEqual(['pkg/sub/package.json'])
      expect(workspacePackageNames).toStrictEqual(['basic-sub-package'])
    })

    it('handles simple workspace with --workspaces and --root option', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        { root: true, workspaces: true },
      )

      // with --root should return root package and the sub-package
      expect(pkgs).toStrictEqual(['package.json', 'pkg/sub/package.json'])
      expect(workspacePackages).toStrictEqual(['basic-sub-package'])
    })

    it('handles simple workspace with --workspaces=false', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-basic/',
        { workspaces: false },
      )

      // with workspaces=false should return just the root package, no sub-packages,
      // when inside a workspace project
      expect(pkgs).toStrictEqual(['package.json'])
      expect(workspacePackages).toStrictEqual([])
    })

    describe('--workspace="<string>"', () => {
      it('handles simple workspace with --workspace="basic-sub-package"', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspace: ['basic-sub-package'] },
        )

        // should only return the sub-package
        expect(pkgs).toStrictEqual(['pkg/sub/package.json'])
        expect(workspacePackages).toStrictEqual(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces and --workspace="basic-sub-package"', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspaces: true, workspace: ['basic-sub-package'] },
        )

        expect(pkgs).toStrictEqual(['pkg/sub/package.json'])
        expect(workspacePackages).toStrictEqual(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces, --workspace="basic-sub-package", and --root option', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { root: true, workspaces: true, workspace: ['basic-sub-package'] },
        )

        // with --root should return root package and the sub-package
        expect(pkgs).toStrictEqual(['package.json', 'pkg/sub/package.json'])
        expect(workspacePackages).toStrictEqual(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces and --workspace=<empty>', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspaces: true, workspace: [] },
        )

        expect(pkgs).toStrictEqual(['pkg/sub/package.json'])
        expect(workspacePackages).toStrictEqual(['basic-sub-package'])
      })

      it('handles simple workspace with --workspaces=false and --workspace="basic-sub-package"', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-basic/',
          { workspaces: false, workspace: ['basic-sub-package'] },
        )

        expect(pkgs).toStrictEqual(['pkg/sub/package.json'])
        expect(workspacePackages).toStrictEqual(['basic-sub-package'])
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

        expect(pkgs).toStrictEqual([])
        expect(workspacePackages).toStrictEqual([])
      })
    })

    describe('package.workspaces is object and package.workspaces.packages is empty array', () => {
      it('should return empty data for empty workspaces', async () => {
        const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
          'test-data/workspace-no-sub-packages/',
          { workspaces: true },
        )

        expect(pkgs).toStrictEqual([])
        expect(workspacePackages).toStrictEqual([])
      })
    })
  })

  describe('catalog dependencies', () => {
    it('includes a synthetic catalog package aggregating pnpm-workspace.yaml catalog and catalogs', async () => {
      const [pkgInfos]: [PackageInfo[], string[]] = await getAllPackages({
        cwd: path.join(__dirname, 'test-data/workspace-catalog').replace(/\\/g, '/'),
        workspaces: true,
        packageManager: 'pnpm',
        loglevel: 'silent',
      })

      const catalogInfo = pkgInfos.find((info: PackageInfo) => info.name === 'catalogs')
      expect(catalogInfo).toBeDefined()
      expect(catalogInfo!.pkg.dependencies).toStrictEqual({ chalk: '^5.0.0', react: '^18.0.0' })
      expect(catalogInfo!.filepath.endsWith('pnpm-workspace.yaml')).toBe(true)
    })
  })

  describe('.pnpm-store', () => {
    it('ignores .pnpm-store directory during --deep traversal', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/deep-pnpm-store/',
        { deep: true },
      )

      // should only find the root package.json, not the one inside .pnpm-store
      expect(pkgs).toStrictEqual(['package.json'])
      expect(workspacePackages).toStrictEqual([])
    })
  })

  describe('sub-package-names', () => {
    // workspace globs match directories, not package names (like npm)
    it('--workspaces resolves each workspace directory and falls back to the directory name', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-sub-package-names/',
        { workspaces: true },
      )

      expect(pkgs).toStrictEqual(['pkg/dirname-matches-name/package.json', 'pkg/dirname-will-become-name/package.json'])
      expect(workspacePackages).toStrictEqual(['dirname-matches-name', 'dirname-will-become-name'])
    })

    it('--workspace selects packages by name', async () => {
      const [pkgs, workspacePackages]: [string[], string[]] = await getAllPackagesForTest(
        'test-data/workspace-sub-package-names/',
        {
          workspaces: false,
          workspace: ['dirname-matches-name', 'dirname-will-become-name'],
        },
      )

      expect(pkgs).toStrictEqual(['pkg/dirname-matches-name/package.json', 'pkg/dirname-will-become-name/package.json'])
      expect(workspacePackages).toStrictEqual(['dirname-matches-name', 'dirname-will-become-name'])
    })
  })
})
