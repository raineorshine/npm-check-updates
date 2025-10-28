/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint doesn't like .should.be.empty syntax
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import ncu from '../src/'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))

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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))

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
    before(() => {
      stub = stubVersions(
        {
          'ncu-test-v2': '2.0.0',
          'ncu-test-tag': '1.1.0',
          'ncu-test-return-version': '2.0.0',
        },
        { spawn: true },
      )
    })
    after(() => {
      stub.restore()
    })

    describe('--workspaces', function () {
      this.timeout(60000)

      it('do not allow --workspaces and --deep together', async () => {
        await ncu({ workspaces: true, deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
      })

      it('update workspaces with --workspaces', async () => {
        const tempDir = await setup(['packages/a'])
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.not.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update workspaces glob', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update workspaces with -w', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '-w'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
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

        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output.should.not.have.property('other/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      // support for object type with packages property
      // https://classic.yarnpkg.com/blog/2018/02/15/nohoist/
      it('update workspaces/packages', async () => {
        const tempDir = await setup({ packages: ['packages/**'] })
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      // https://github.com/raineorshine/npm-check-updates/issues/1217
      it('ignore local workspace packages', async () => {
        const tempDir = await setupSymlinkedPackages()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--workspaces'], {}, { cwd: tempDir })
          const upgrades = JSON.parse(stdout)
          upgrades.should.deep.equal({
            'package.json': {},
            'packages/foo/package.json': {
              'ncu-test-v2': '2.0.0',
            },
            'packages/bar/package.json': {
              'ncu-test-v2': '2.0.0',
            },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('ignore local workspace packages with different names than their folders', async () => {
        const tempDir = await setupSymlinkedPackages(['packages/**'], 'chalk')
        try {
          const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--workspaces'], {}, { cwd: tempDir })
          const upgrades = JSON.parse(stdout)
          upgrades.should.deep.equal({
            'package.json': {},
            'packages/foo/package.json': {
              'ncu-test-v2': '2.0.0',
            },
            'packages/bar/package.json': {
              'ncu-test-v2': '2.0.0',
            },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })

    describe('--workspace', function () {
      this.timeout(60000)

      it('do not allow --workspace and --deep together', async () => {
        await ncu({ workspace: ['a'], deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
      })

      it('do not allow --workspace and --workspaces together', async () => {
        await ncu({ workspace: ['a'], deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
      })

      it('update single workspace with --workspace', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspace', 'a'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.not.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update more than one workspace', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn(
            'node',
            [bin, '--jsonAll', '--workspace', 'a', '--workspace', 'b'],
            {},
            {
              cwd: tempDir,
            },
          )
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update single workspace with --cwd and --workspace', async () => {
        const tempDir = await setup()
        try {
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
          output.should.have.property('packages/a/package.json')
          output.should.not.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      // https://github.com/raineorshine/npm-check-updates/issues/1304
      it('update namespaced workspace', async () => {
        const tempDir = await setupSymlinkedPackages(['packages/**'], '@ncu/bar')
        try {
          const { stdout } = await spawn(
            'node',
            [bin, '--jsonUpgraded', '--workspace', '@ncu/bar'],
            {},
            {
              cwd: tempDir,
            },
          )
          const upgrades = JSON.parse(stdout)
          upgrades.should.deep.equal({
            'package.json': {},
            'packages/bar/package.json': {
              'ncu-test-v2': '2.0.0',
            },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })

    describe('--root/--no-root', function () {
      this.timeout(60000)

      it('update root project by default', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces', '--root'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('package.json')
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['package.json'].dependencies.should.have.property('ncu-test-v2')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('do not update the root project with --no-root', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces', '--no-root'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.not.have.property('package.json')
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update root project and workspaces if errorLevel=2', async () => {
        const tempDir = await setup()
        try {
          await spawn(
            'node',
            [bin, '--upgrade', '--workspaces', '--errorLevel', '2'],
            {},
            {
              cwd: tempDir,
            },
          ).should.eventually.be.rejectedWith('Dependencies not up-to-date')
          const upgradedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'))
          upgradedPkg.should.have.property('dependencies')
          upgradedPkg.dependencies.should.have.property('ncu-test-v2')
          upgradedPkg.dependencies['ncu-test-v2'].should.not.equal('1.0.0')
          const upgradedPkgA = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/a/package.json'), 'utf-8'))
          upgradedPkgA.should.have.property('dependencies')
          upgradedPkgA.dependencies.should.have.property('ncu-test-tag')
          upgradedPkgA.dependencies['ncu-test-tag'].should.not.equal('1.0.0')
          const upgradedPkgB = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/b/package.json'), 'utf-8'))
          upgradedPkgB.should.have.property('dependencies')
          upgradedPkgB.dependencies.should.have.property('ncu-test-return-version')
          upgradedPkgB.dependencies['ncu-test-return-version'].should.not.equal('1.0.0')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
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

        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('package.json')
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output.should.not.have.property('other/package.json')
          output['package.json'].dependencies.should.have.property('ncu-test-v2')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })

    describe('--workspace should include --root by default', function () {
      this.timeout(60000)

      it('update root project and single workspace', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspace', 'a'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('package.json')
          output.should.have.property('packages/a/package.json')
          output.should.not.have.property('packages/b/package.json')
          output['package.json'].dependencies.should.have.property('ncu-test-v2')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update more than one workspace', async () => {
        const tempDir = await setup()
        try {
          const { stdout } = await spawn(
            'node',
            [bin, '--jsonAll', '--workspace', 'a', '--workspace', 'b'],
            {},
            {
              cwd: tempDir,
            },
          )
          const output = JSON.parse(stdout)
          output.should.have.property('package.json')
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['package.json'].dependencies.should.have.property('ncu-test-v2')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })

    describe('pnpm', () => {
      it('read packages from pnpm-workspace.yaml', async () => {
        const tempDir = await setup(['packages/**'], { pnpm: true })
        try {
          const { stdout } = await spawn('node', [bin, '--jsonAll', '--workspaces'], {}, { cwd: tempDir })
          const output = JSON.parse(stdout)
          output.should.have.property('packages/a/package.json')
          output.should.have.property('packages/b/package.json')
          output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
          output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update pnpm catalog dependencies from pnpm-workspace.yaml (named catalogs)', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
        try {
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
          stderr.should.be.empty
          stdout.should.not.be.empty

          const output = JSON.parse(stdout)

          // Should include catalog updates
          output.should.deep.equal({
            'pnpm-workspace.yaml': {
              packages: ['packages/**'],
              catalog: { 'ncu-test-v2': '2.0.0' },
              catalogs: { default: { 'ncu-test-v2': '2.0.0' }, test: { 'ncu-test-tag': '1.1.0' } },
            },
            'package.json': { dependencies: { 'ncu-test-v2': '2.0.0' } },
            'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update pnpm catalog dependencies from pnpm-workspace.yaml (singular catalog)', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
        try {
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
          stderr.should.be.empty
          stdout.should.not.be.empty

          const output = JSON.parse(stdout)

          // Should include catalog updates
          output.should.deep.equal({
            'pnpm-workspace.yaml': {
              packages: ['packages/**'],
              catalog: { 'ncu-test-v2': '2.0.0', 'ncu-test-tag': '1.1.0' },
            },
            'package.json': { dependencies: { 'ncu-test-v2': '2.0.0' } },
            'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:' } },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update pnpm catalog with --workspace flag (specific workspace)', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
        try {
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
          stderr.should.be.empty
          stdout.should.not.be.empty

          const output = JSON.parse(stdout)

          // Should include catalog updates even when using --workspace (not --workspaces)
          output.should.have.property('pnpm-workspace.yaml')
          output['pnpm-workspace.yaml'].should.deep.equal({
            packages: ['packages/*'],
            catalog: { 'ncu-test-v2': '2.0.0' },
          })
          output.should.have.property('packages/a/package.json')
          output['packages/a/package.json'].should.deep.equal({
            name: 'a',
            dependencies: { 'ncu-test-v2': 'catalog:' },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })

    describe('bun', () => {
      it('update bun catalog dependencies from package.json (top-level)', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
        try {
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
          stderr.should.be.empty
          stdout.should.not.be.empty

          const output = JSON.parse(stdout)

          // Should include catalog updates in package.json
          output.should.deep.equal({
            'package.json': {
              workspaces: ['packages/**'],
              catalog: { 'ncu-test-v2': '2.0.0' },
              catalogs: { test: { 'ncu-test-tag': '1.1.0' } },
            },
            'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('update bun catalog dependencies from package.json (workspaces object)', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
        try {
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
          stderr.should.be.empty
          stdout.should.not.be.empty

          const output = JSON.parse(stdout)

          // Should include catalog updates in package.json
          output.should.deep.equal({
            'package.json': {
              workspaces: {
                packages: ['packages/**'],
                catalog: { 'ncu-test-v2': '2.0.0' },
                catalogs: { test: { 'ncu-test-tag': '1.1.0' } },
              },
            },
            'packages/a/package.json': { dependencies: { 'ncu-test-tag': 'catalog:test' } },
          })
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })
  })

  // cannot be stubbed because npm config printing occurs in viewMany
  describe('not stubbed', () => {
    // This test fails on Node v20.3.1 on Github Actions (only).
    // The stdout fails to match the expected value: "npm config (workspace project):\n{ncutest: 'root' }"
    // Strangely, it matches up to the single quote: "npm config (workspace project):\n{ncutest: "
    it.skip('merge local npm config with pnpm workspace npm config', async () => {
      const tempDir = await setup(['packages/**'], { pnpm: true })
      try {
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
        stdout.should.include(`npm config (workspace project):\n{ ncutest: 'root' }`)
        stdout.should.include(`Using merged npm config:\n{\n  ncutest: 'a',`)
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    })
  })
})
