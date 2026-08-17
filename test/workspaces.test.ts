import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import ncu from '../src/index.ts'
import makeTempDir from './helpers/makeTempDir.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')

/** Creates a temp directory with nested package files for --workspaces testing. Returns the temp directory name (should be removed by caller).
 *
 * The file tree that is created is:
 * |- package.json
 * |- packages/
 * |  - a/
 * |    - package.json
 * |  - b/
 * |    - package.json
 */
const setup = async (
  workspaces: string[] | { packages: string[] } = ['packages/**'],
  {
    pnpm,
  }: {
    // add workspaces to a pnpm-workspace.yaml file instead of the package file
    pnpm?: boolean
  } = {},
) => {
  const tempDir = await makeTempDir()

  const pkgDataRoot = JSON.stringify({
    dependencies: {
      'ncu-test-v2': '1.0.0',
    },
    ...(!pnpm ? { workspaces } : null),
  })

  const pkgDataA = JSON.stringify({
    dependencies: {
      'ncu-test-tag': '1.0.0',
    },
  })

  const pkgDataB = JSON.stringify({
    dependencies: {
      'ncu-test-return-version': '1.0.0',
    },
  })

  // write root package file
  await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
  if (pnpm) {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:\n${((workspaces as { packages: string[] }).packages || workspaces)
        .map(glob => `  - '${glob}'`)
        .join('\n')}`,
      'utf-8',
    )
  }

  // write workspace package files
  await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/a/package.json'), pkgDataA, 'utf-8')
  await fs.mkdir(path.join(tempDir, 'packages/b'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/b/package.json'), pkgDataB, 'utf-8')

  return tempDir
}

/** Sets up a workspace with a dependency to a symlinked workspace package. */
const setupSymlinkedPackages = async (
  workspaces: string[] | { packages: string[] } = ['packages/**'],
  // applies a custom package name to /packages/bar
  customName?: string,
) => {
  const tempDir = await makeTempDir()

  const pkgDataRoot = JSON.stringify({ workspaces })

  const pkgDataFoo = JSON.stringify({
    dependencies: {
      [customName || 'bar']: '0.4.2',
      'ncu-test-v2': '1.0.0',
    },
  })

  const pkgDataBar = JSON.stringify({
    ...(customName ? { name: customName } : null),
    dependencies: {
      'ncu-test-v2': '1.1.0',
    },
  })

  // write root package file
  await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')

  // write workspace package files
  await fs.mkdir(path.join(tempDir, 'packages/foo'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/foo/package.json'), pkgDataFoo, 'utf-8')
  await fs.mkdir(path.join(tempDir, 'packages/bar'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/bar/package.json'), pkgDataBar, 'utf-8')

  return tempDir
}

let stub: { restore: () => void }

describe('workspaces', () => {
  describe('stubbed', () => {
    beforeAll(() => {
      stub = stubVersions(
        {
          'ncu-test-v2': '2.0.0',
          'ncu-test-tag': '1.1.0',
          'ncu-test-return-version': '2.0.0',
        },
        { spawn: true },
      )
    })
    afterAll(() => {
      stub.restore()
    })

    describe('--workspaces', () => {
      it('do not allow --workspaces and --deep together', async () => {
        await expect(ncu({ workspaces: true, deep: true })).rejects.toThrow('Cannot specify both')
      })

      it('update workspaces with --workspaces', async () => {
        const tempDir = await setup(['packages/a'])
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).not.toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
      })

      it('update workspaces glob', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      it('update workspaces with -w', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '-w'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      it('do not update non-workspace subpackages', async () => {
        const tempDir = await setup()
        await fs.mkdir(path.join(tempDir, 'other'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'other/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-return-version': '1.0.0',
            },
          }),
          'utf-8',
        )

        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output).not.toHaveProperty('other/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      // support for object type with packages property
      // https://classic.yarnpkg.com/blog/2018/02/15/nohoist/
      it('update workspaces/packages', async () => {
        const tempDir = await setup({ packages: ['packages/**'] })
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      // https://github.com/raineorshine/npm-check-updates/issues/1217
      it('ignore local workspace packages', async () => {
        const tempDir = await setupSymlinkedPackages()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--workspaces'], {}, { cwd: tempDir })
        const upgrades = JSON.parse(stdout)
        expect(upgrades).toStrictEqual({
          'package.json': {},
          'packages/foo/package.json': {
            'ncu-test-v2': '2.0.0',
          },
          'packages/bar/package.json': {
            'ncu-test-v2': '2.0.0',
          },
        })
      })

      it('ignore local workspace packages with different names than their folders', async () => {
        const tempDir = await setupSymlinkedPackages(['packages/**'], 'chalk')
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--workspaces'], {}, { cwd: tempDir })
        const upgrades = JSON.parse(stdout)
        expect(upgrades).toStrictEqual({
          'package.json': {},
          'packages/foo/package.json': {
            'ncu-test-v2': '2.0.0',
          },
          'packages/bar/package.json': {
            'ncu-test-v2': '2.0.0',
          },
        })
      })
    })

    describe('--workspace', () => {
      it('do not allow --workspace and --deep together', async () => {
        await expect(ncu({ workspace: ['a'], deep: true })).rejects.toThrow('Cannot specify both')
      })

      it('do not allow --workspace and --workspaces together', async () => {
        await expect(ncu({ workspace: ['a'], deep: true })).rejects.toThrow('Cannot specify both')
      })

      it('update single workspace with --workspace', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspace', 'a'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).not.toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
      })

      it('update more than one workspace', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspace', 'a', '--workspace', 'b'],
          {},
          {
            cwd: tempDir,
          },
        )
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      it('update single workspace with --cwd and --workspace', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        // when npm-check-updates is executed in a workspace directory but uses --cwd to point up to the root, make sure that the root package.json is checked for the workspaces property
        const { stdout } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspace', 'a', '--cwd', '../../'],
          {},
          {
            cwd: path.join(tempDir, 'packages', 'a'),
          },
        )
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).not.toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
      })

      // https://github.com/raineorshine/npm-check-updates/issues/1304
      it('update namespaced workspace', async () => {
        const tempDir = await setupSymlinkedPackages(['packages/**'], '@ncu/bar')
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn(
          'node',
          [bin, '--jsonUpgraded', '--workspace', '@ncu/bar'],
          {},
          {
            cwd: tempDir,
          },
        )
        const upgrades = JSON.parse(stdout)
        expect(upgrades).toStrictEqual({
          'package.json': {},
          'packages/bar/package.json': {
            'ncu-test-v2': '2.0.0',
          },
        })
      })
    })

    describe('--root/--no-root', () => {
      it('update root project by default', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces', '--root'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('package.json')
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['package.json'].dependencies).toHaveProperty('ncu-test-v2')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      it('do not update the root project with --no-root', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces', '--no-root'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).not.toHaveProperty('package.json')
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      it('do not update the root project with root: false in the rc config', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        await fs.writeFile(path.join(tempDir, '.ncurc.json'), JSON.stringify({ root: false }), 'utf-8')
        const { stdout } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces', '--configFilePath', tempDir],
          {},
          { cwd: tempDir },
        )
        const output = JSON.parse(stdout)
        expect(output).not.toHaveProperty('package.json')
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
      })

      it('update root project and workspaces if errorLevel=2', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        await expect(
          spawn(
            'node',
            [bin, '--upgrade', '--workspaces', '--errorLevel', '2'],
            {},
            {
              cwd: tempDir,
            },
          ),
        ).rejects.toThrow('Dependencies not up-to-date')
        const upgradedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'))
        expect(upgradedPkg).toHaveProperty('dependencies')
        expect(upgradedPkg.dependencies).toHaveProperty('ncu-test-v2')
        expect(upgradedPkg.dependencies['ncu-test-v2']).not.toBe('1.0.0')
        const upgradedPkgA = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/a/package.json'), 'utf-8'))
        expect(upgradedPkgA).toHaveProperty('dependencies')
        expect(upgradedPkgA.dependencies).toHaveProperty('ncu-test-tag')
        expect(upgradedPkgA.dependencies['ncu-test-tag']).not.toBe('1.0.0')
        const upgradedPkgB = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/b/package.json'), 'utf-8'))
        expect(upgradedPkgB).toHaveProperty('dependencies')
        expect(upgradedPkgB.dependencies).toHaveProperty('ncu-test-return-version')
        expect(upgradedPkgB.dependencies['ncu-test-return-version']).not.toBe('1.0.0')
      })

      it('do not update non-workspace subpackages', async () => {
        const tempDir = await setup()
        await fs.mkdir(path.join(tempDir, 'other'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'other/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-return-version': '1.0.0',
            },
          }),
          'utf-8',
        )

        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('package.json')
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output).not.toHaveProperty('other/package.json')
        expect(output['package.json'].dependencies).toHaveProperty('ncu-test-v2')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })
    })

    describe('--workspace should include --root by default', () => {
      it('update root project and single workspace', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspace', 'a'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('package.json')
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).not.toHaveProperty('packages/b/package.json')
        expect(output['package.json'].dependencies).toHaveProperty('ncu-test-v2')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
      })

      it('update more than one workspace', async () => {
        const tempDir = await setup()
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspace', 'a', '--workspace', 'b'],
          {},
          {
            cwd: tempDir,
          },
        )
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('package.json')
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['package.json'].dependencies).toHaveProperty('ncu-test-v2')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })
    })

    describe('pnpm', () => {
      it('read packages from pnpm-workspace.yaml', async () => {
        const tempDir = await setup(['packages/**'], { pnpm: true })
        onTestFinished(() => removeDir(tempDir))
        const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
        const output = JSON.parse(stdout)
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output).toHaveProperty('packages/b/package.json')
        expect(output['packages/a/package.json'].dependencies).toHaveProperty('ncu-test-tag')
        expect(output['packages/b/package.json'].dependencies).toHaveProperty('ncu-test-return-version')
      })

      it('update pnpm catalog dependencies from pnpm-workspace.yaml (named catalogs)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          dependencies: {
            'ncu-test-v2': '1.0.0',
          },
        })

        const pnpmWorkspaceData = `packages:
  - 'packages/**'

catalogs:
  default:
    ncu-test-v2: '1.0.0'
  test:
    ncu-test-tag: '1.0.0'
`

        // write root package file and pnpm-workspace.yaml
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), pnpmWorkspaceData, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '', 'utf-8')

        // create workspace package
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-tag': 'catalog:test',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates
        expect(output).toStrictEqual({
          'pnpm-workspace.yaml': {
            packages: ['packages/**'],
            catalogs: { default: { 'ncu-test-v2': '2.0.0' }, test: { 'ncu-test-tag': '1.1.0' } },
          },
          'package.json': { dependencies: { 'ncu-test-v2': '2.0.0' } },
          'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
        })
      })

      it('update pnpm catalog dependencies from pnpm-workspace.yaml (singular catalog)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          dependencies: {
            'ncu-test-v2': '1.0.0',
          },
        })

        const pnpmWorkspaceData = `packages:
  - 'packages/**'

catalog:
  ncu-test-v2: '1.0.0'
  ncu-test-tag: '1.0.0'
`

        // write root package file and pnpm-workspace.yaml
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), pnpmWorkspaceData, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '', 'utf-8')

        // create workspace package
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-tag': 'catalog:',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates
        expect(output).toStrictEqual({
          'pnpm-workspace.yaml': {
            packages: ['packages/**'],
            catalog: { 'ncu-test-v2': '2.0.0', 'ncu-test-tag': '1.1.0' },
          },
          'package.json': { dependencies: { 'ncu-test-v2': '2.0.0' } },
          'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:' } },
        })
      })

      it('do not throw on valid package protocols when target is not "latest"', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({}), 'utf-8')
        await fs.writeFile(
          path.join(tempDir, 'pnpm-workspace.yaml'),
          `packages:\n  - 'packages/**'\n\ncatalog:\n  ncu-test-tag: '1.0.0'\n`,
          'utf-8',
        )
        await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '', 'utf-8')

        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-tag': 'catalog:',
              'ncu-test-v2': 'workspace:^',
              'some-link': 'link:../local-pkg',
              'some-file': 'file:./local.tgz',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces', '--target', 'minor'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        expect(stderr).not.toMatch(/Invalid comparator/)
        expect(stdout).not.toMatch(/Invalid comparator/)

        // Workspace package.json should be left untouched because its dependencies
        // are all package-manager protocol refs.
        const output = JSON.parse(stdout)
        expect(output['packages/a/package.json'].dependencies).toStrictEqual({
          'ncu-test-tag': 'catalog:',
          'ncu-test-v2': 'workspace:^',
          'some-link': 'link:../local-pkg',
          'some-file': 'file:./local.tgz',
        })
      })

      it('update pnpm catalog dependencies from pnpm-workspace.yaml', async () => {
        const tempDir = await makeTempDir()
        try {
          const pkgDataRoot = JSON.stringify({
            dependencies: {
              'ncu-test-v2': '1.0.0',
            },
          })

          const pnpmWorkspaceData = `packages:
  - 'packages/**'

catalog:
  ncu-test-tag: '1.0.0'
  ncu-test-v2: '1.0.0'

catalogs:
  test:
    ncu-test-tag: '1.0.0'
`

          // write root package file and pnpm-workspace.yaml
          await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
          await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), pnpmWorkspaceData, 'utf-8')
          await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '', 'utf-8')

          // create workspace package
          await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
          await fs.writeFile(
            path.join(tempDir, 'packages/a/package.json'),
            JSON.stringify({
              dependencies: {
                'ncu-test-tag': 'catalog:',
              },
            }),
            'utf-8',
          )

          await spawn('node', [bin, '-u', '--workspaces'], { rejectOnError: false }, { cwd: tempDir })

          const updatedConfig = await fs.readFile(path.join(tempDir, 'pnpm-workspace.yaml'), 'utf-8')
          expect(updatedConfig).toBe(`packages:
  - 'packages/**'

catalog:
  ncu-test-tag: '1.1.0'
  ncu-test-v2: '2.0.0'

catalogs:
  test:
    ncu-test-tag: '1.1.0'
`)
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update pnpm catalog dependencies nested under workspaces key in pnpm-workspace.yaml', async () => {
        const tempDir = await makeTempDir()
        try {
          const pkgDataRoot = JSON.stringify({
            workspaces: ['packages/**'],
          })

          // Catalogs nested under a `workspaces` key (alternative pnpm-workspace.yaml format)
          const pnpmWorkspaceData = `workspaces:
  packages:
    - 'packages/**'
  catalog:
    ncu-test-tag: '1.0.0'
    ncu-test-v2: '1.0.0'
  catalogs:
    test:
      ncu-test-tag: '1.0.0'
`

          await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
          await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), pnpmWorkspaceData, 'utf-8')
          await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '', 'utf-8')

          await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
          await fs.writeFile(
            path.join(tempDir, 'packages/a/package.json'),
            JSON.stringify({
              dependencies: {
                'ncu-test-tag': 'catalog:',
              },
            }),
            'utf-8',
          )

          await spawn('node', [bin, '-u', '--workspaces'], { rejectOnError: false }, { cwd: tempDir })

          const updatedConfig = await fs.readFile(path.join(tempDir, 'pnpm-workspace.yaml'), 'utf-8')
          expect(updatedConfig).toBe(`workspaces:
  packages:
    - 'packages/**'
  catalog:
    ncu-test-tag: '1.1.0'
    ncu-test-v2: '2.0.0'
  catalogs:
    test:
      ncu-test-tag: '1.1.0'
`)
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update pnpm catalog with --workspace flag (specific workspace)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          workspaces: ['packages/*'],
        })

        const pnpmWorkspaceData = `packages:
  - 'packages/*'

catalog:
  ncu-test-v2: '1.0.0'
`

        // write root package file and pnpm-workspace.yaml
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), pnpmWorkspaceData, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '', 'utf-8')

        // create workspace packages
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            name: 'a',
            dependencies: {
              'ncu-test-v2': 'catalog:',
            },
          }),
          'utf-8',
        )

        await fs.mkdir(path.join(tempDir, 'packages/b'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/b/package.json'),
          JSON.stringify({
            name: 'b',
            dependencies: {
              'ncu-test-tag': '1.0.0',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspace', 'a'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates even when using --workspace (not --workspaces)
        expect(output).toHaveProperty('pnpm-workspace.yaml')
        expect(output['pnpm-workspace.yaml']).toStrictEqual({
          packages: ['packages/*'],
          catalog: { 'ncu-test-v2': '2.0.0' },
        })
        expect(output).toHaveProperty('packages/a/package.json')
        expect(output['packages/a/package.json']).toStrictEqual({
          name: 'a',
          dependencies: { 'ncu-test-v2': 'catalog:' },
        })
      })
    })

    describe('yarn', () => {
      it('update yarn catalog dependencies from yarnrc.yml (named catalogs)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          workspaces: ['packages/**'],
          dependencies: {
            'ncu-test-v2': '1.0.0',
          },
        })

        const yarnConfig = `
catalogs:
  default:
    ncu-test-v2: '1.0.0'
  test:
    ncu-test-tag: '1.0.0'
`

        // write root package file and .yarnrc.yml
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, '.yarnrc.yml'), yarnConfig, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'yarn.lock'), '', 'utf-8')

        // create workspace package
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-tag': 'catalog:test',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates
        expect(output).toStrictEqual({
          '.yarnrc.yml': {
            catalogs: { default: { 'ncu-test-v2': '2.0.0' }, test: { 'ncu-test-tag': '1.1.0' } },
          },
          'package.json': { workspaces: ['packages/**'], dependencies: { 'ncu-test-v2': '2.0.0' } },
          'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
        })
      })

      it('update yarn catalog dependencies from .yarnrc.yml (singular catalog)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          workspaces: ['packages/**'],
          dependencies: {
            'ncu-test-v2': '1.0.0',
          },
        })

        const yarnConfig = `
catalog:
  ncu-test-v2: '1.0.0'
  ncu-test-tag: '1.0.0'
`

        // write root package file and pnpm-workspace.yaml
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, '.yarnrc.yml'), yarnConfig, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'yarn.lock'), '', 'utf-8')

        // create workspace package
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-tag': 'catalog:',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates
        expect(output).toStrictEqual({
          '.yarnrc.yml': {
            catalog: { 'ncu-test-v2': '2.0.0', 'ncu-test-tag': '1.1.0' },
          },
          'package.json': { workspaces: ['packages/**'], dependencies: { 'ncu-test-v2': '2.0.0' } },
          'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:' } },
        })
      })
      it('update yarn catalog dependencies from .yarnrc.yml', async () => {
        const tempDir = await makeTempDir()
        try {
          const pkgDataRoot = JSON.stringify({
            workspaces: ['packages/**'],
            dependencies: {
              'ncu-test-v2': '1.0.0',
            },
          })

          const yarnConfig = `
catalog:
  ncu-test-v2: '1.0.0'
  ncu-test-tag: '1.0.0'

catalogs:
  test:
    ncu-test-tag: '1.0.0'
`

          // write root package file and pnpm-workspace.yaml
          await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
          await fs.writeFile(path.join(tempDir, '.yarnrc.yml'), yarnConfig, 'utf-8')
          await fs.writeFile(path.join(tempDir, 'yarn.lock'), '', 'utf-8')

          // create workspace package
          await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
          await fs.writeFile(
            path.join(tempDir, 'packages/a/package.json'),
            JSON.stringify({
              dependencies: {
                'ncu-test-tag': 'catalog:',
              },
            }),
            'utf-8',
          )

          const { stdout } = await spawn(
            'node',
            [bin, '-u', '--workspaces'],
            { rejectOnError: false },
            { cwd: tempDir },
          )

          expect(stdout).not.toBe('')

          const updatedConfig = await fs.readFile(path.join(tempDir, '.yarnrc.yml'), 'utf-8')
          expect(updatedConfig).toBe(`
catalog:
  ncu-test-v2: '2.0.0'
  ncu-test-tag: '1.1.0'

catalogs:
  test:
    ncu-test-tag: '1.1.0'
`)
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })

    describe('bun', () => {
      it('update bun catalog dependencies from package.json (top-level)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          workspaces: ['packages/**'],
          catalog: {
            'ncu-test-v2': '1.0.0',
          },
          catalogs: {
            test: {
              'ncu-test-tag': '1.0.0',
            },
          },
        })

        // write root package.json and bun.lock
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'bun.lock'), '{}', 'utf-8')

        // create workspace package
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({ dependencies: { 'ncu-test-tag': 'catalog:test' } }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces', '--root'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates in package.json
        expect(output).toStrictEqual({
          'package.json': {
            workspaces: ['packages/**'],
            catalog: { 'ncu-test-v2': '2.0.0' },
            catalogs: { test: { 'ncu-test-tag': '1.1.0' } },
          },
          'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
        })
      })

      it('update bun catalog dependencies from package.json (workspaces object)', async () => {
        const tempDir = await makeTempDir()
        onTestFinished(() => removeDir(tempDir))
        const pkgDataRoot = JSON.stringify({
          workspaces: {
            packages: ['packages/**'],
            catalog: {
              'ncu-test-v2': '1.0.0',
            },
            catalogs: {
              test: {
                'ncu-test-tag': '1.0.0',
              },
            },
          },
        })

        // write root package.json and bun.lock
        await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')
        await fs.writeFile(path.join(tempDir, 'bun.lock'), '{}', 'utf-8')

        // create workspace package
        await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
        await fs.writeFile(
          path.join(tempDir, 'packages/a/package.json'),
          JSON.stringify({
            dependencies: {
              'ncu-test-tag': 'catalog:test',
            },
          }),
          'utf-8',
        )

        const { stdout, stderr } = await spawn(
          'node',
          [bin, '--jsonAll', '--workspaces', '--root'],
          { rejectOnError: false },
          { cwd: tempDir },
        )

        // Assert no errors and valid output
        expect(stderr).toBe('')
        expect(stdout).not.toBe('')

        const output = JSON.parse(stdout)

        // Should include catalog updates in package.json
        expect(output).toStrictEqual({
          'package.json': {
            workspaces: {
              packages: ['packages/**'],
              catalog: { 'ncu-test-v2': '2.0.0' },
              catalogs: { test: { 'ncu-test-tag': '1.1.0' } },
            },
          },
          'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
        })
      })
    })
  })

  // cannot be stubbed because npm config printing occurs in viewMany
  describe('not stubbed', () => {
    it('merge local npm config with pnpm workspace npm config', async () => {
      const tempDir = await setup(['packages/**'], { pnpm: true })
      onTestFinished(() => removeDir(tempDir))
      await fs.writeFile(path.join(tempDir, '.npmrc'), 'ncutest=root')
      await fs.writeFile(path.join(tempDir, 'packages/a/.npmrc'), 'ncutest=a')
      const { stdout } = await spawn(
        'node',
        [bin, '--verbose', '--packageManager', 'pnpm'],
        {},
        {
          cwd: path.join(tempDir, 'packages/a'),
        },
      )
      const output = stripAnsi(stdout)
      expect(output).toContain(`npm config (workspace project):\n{ ncutest: 'root' }`)
      // local .npmrc (ncutest=a) overrides the pnpm workspace .npmrc (ncutest=root)
      expect(output).toContain(`merged npm config:`)
      expect(output).toContain(`ncutest: 'a'`)
    })
  })
})
