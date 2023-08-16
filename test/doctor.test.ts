import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { rimraf } from 'rimraf'
import spawn from 'spawn-please'
import { cliOptionsMap } from '../src/cli-options'
import { chalkInit } from '../src/lib/chalk'
import { PackageManagerName } from '../src/types/PackageManagerName'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')
const doctorTests = path.join(__dirname, 'test-data/doctor')

/** Run the ncu CLI. */
const ncu = (args: string[], options?: Record<string, unknown>) => spawn('node', [bin, ...args], options)

/** Assertions for npm or yarn when tests pass. */
const testPass = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('upgrade dependencies when tests pass', async function () {
    // use dynamic import for ESM module
    const { default: stripAnsi } = await import('strip-ansi')
    const cwd = path.join(doctorTests, 'pass')
    const pkgPath = path.join(cwd, 'package.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const lockfilePath = path.join(
      cwd,
      packageManager === 'yarn'
        ? 'yarn.lock'
        : packageManager === 'pnpm'
        ? 'pnpm-lock.yaml'
        : packageManager === 'bun'
        ? 'bun.lockb'
        : 'package-lock.json',
    )
    const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''

    // touch yarn.lock
    // yarn.lock is necessary otherwise yarn sees the package.json in the npm-check-updates directory and throws an error.
    if (packageManager === 'yarn') {
      await fs.writeFile(lockfilePath, '')
    }

    try {
      // explicitly set packageManager to avoid auto yarn detection
      await ncu(['--doctor', '-u', '-p', packageManager], {
        cwd,
        stdout: function (data: string) {
          stdout += data
        },
        stderr: function (data: string) {
          stderr += data
        },
      })
    } catch (e) {}

    const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

    // cleanup before assertions in case they fail
    await fs.writeFile(pkgPath, pkgOriginal)
    rimraf.sync(nodeModulesPath)
    rimraf.sync(lockfilePath)

    // delete yarn cache
    if (packageManager === 'yarn') {
      rimraf.sync(path.join(cwd, '.yarn'))
      rimraf.sync(path.join(cwd, '.pnp.js'))
    }

    // stdout should include normal output
    stderr.should.equal('')
    stripAnsi(stdout).should.containIgnoreCase('Tests pass')
    stripAnsi(stdout).should.containIgnoreCase('ncu-test-v2  ~1.0.0  →  ~2.0.0')

    // stderr should include first failing upgrade
    stderr.should.equal('')

    // package file should include upgrades
    pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
  })
}

/** Assertions for npm or yarn when tests fail. */
const testFail = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('identify broken upgrade', async function () {
    const cwd = path.join(doctorTests, 'fail')
    const pkgPath = path.join(cwd, 'package.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const lockfilePath = path.join(
      cwd,
      packageManager === 'yarn'
        ? 'yarn.lock'
        : packageManager === 'pnpm'
        ? 'pnpm-lock.yaml'
        : packageManager === 'bun'
        ? 'bun.lockb'
        : 'package-lock.json',
    )
    const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''
    let pkgUpgraded

    // touch yarn.lock (see fail/README)
    if (packageManager === 'yarn') {
      await fs.writeFile(lockfilePath, '')
    }

    try {
      // explicitly set packageManager to avoid auto yarn detection
      await ncu(['--doctor', '-u', '-p', packageManager], {
        cwd,
        stdout: function (data: string) {
          stdout += data
        },
        stderr: function (data: string) {
          stderr += data
        },
      })
    } finally {
      pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')
      await fs.writeFile(pkgPath, pkgOriginal)
      rimraf.sync(nodeModulesPath)
      rimraf.sync(lockfilePath)

      // delete yarn cache
      if (packageManager === 'yarn') {
        rimraf.sync(path.join(cwd, '.yarn'))
        rimraf.sync(path.join(cwd, '.pnp.js'))
      }
    }

    // stdout should include successful upgrades
    stdout.should.containIgnoreCase('ncu-test-v2 ~1.0.0 →')
    stdout.should.not.include('ncu-test-return-version ~1.0.0 →')
    stdout.should.containIgnoreCase('emitter20 1.0.0 →')

    // stderr should include first failing upgrade
    stderr.should.containIgnoreCase('Breaks with v2.x')
    stderr.should.not.include('ncu-test-v2 ~1.0.0 →')
    stderr.should.containIgnoreCase('ncu-test-return-version ~1.0.0 →')
    stderr.should.not.include('emitter20 1.0.0 →')

    // package file should only include successful upgrades
    pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    pkgUpgraded.should.containIgnoreCase('"ncu-test-return-version": "~1.0.0"')
    pkgUpgraded.should.not.include('"emitter20": "1.0.0"') // assert the negation since emitter20 is a live package and the latest version could change (it would be better to mock this)
  })
}

describe('doctor', function () {
  // 3 min timeout
  this.timeout(3 * 60 * 1000)

  describe('npm', () => {
    it('print instructions when -u is not specified', async () => {
      await chalkInit()
      const { default: stripAnsi } = await import('strip-ansi')
      const cwd = path.join(doctorTests, 'nopackagefile')
      const output = await ncu(['--doctor'], { cwd })
      return stripAnsi(output).should.equal(
        `Usage: ncu --doctor\n\n${stripAnsi(
          (cliOptionsMap.doctor.help as (options: { markdown: boolean }) => string)({ markdown: false }),
        )}\n`,
      )
    })

    it('throw an error if there is no package file', async () => {
      const cwd = path.join(doctorTests, 'nopackagefile')
      return ncu(['--doctor', '-u'], { cwd }).should.eventually.be.rejectedWith('Missing or invalid package.json')
    })

    it('throw an error if there is no test script', async () => {
      const cwd = path.join(doctorTests, 'notestscript')
      return ncu(['--doctor', '-u'], { cwd }).should.eventually.be.rejectedWith('No npm "test" script')
    })

    it('throw an error if --packageData or --packageFile are supplied', async () => {
      return Promise.all([
        ncu(['--doctor', '-u', '--packageFile', 'package.json']).should.eventually.be.rejectedWith(
          '--packageData and --packageFile are not allowed with --doctor',
        ),
        ncu(['--doctor', '-u', '--packageData', '{}']).should.eventually.be.rejectedWith(
          '--packageData and --packageFile are not allowed with --doctor',
        ),
      ])
    })

    testPass({ packageManager: 'npm' })
    testFail({ packageManager: 'npm' })

    it('pass through options', async function () {
      // use dynamic import for ESM module
      const { default: stripAnsi } = await import('strip-ansi')
      const cwd = path.join(doctorTests, 'options')
      const pkgPath = path.join(cwd, 'package.json')
      const lockfilePath = path.join(cwd, 'package-lock.json')
      const nodeModulesPath = path.join(cwd, 'node_modules')
      const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
      let stdout = ''
      let stderr = ''

      try {
        // check only ncu-test-v2 (excluding ncu-return-version)
        await ncu(['--doctor', '-u', '--filter', 'ncu-test-v2'], {
          cwd,
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        })
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      rimraf.sync(lockfilePath)
      rimraf.sync(nodeModulesPath)

      // stderr should be empty
      stderr.should.equal('')

      // stdout should include normal output
      stripAnsi(stdout).should.containIgnoreCase('Tests pass')
      stripAnsi(stdout).should.containIgnoreCase('ncu-test-v2  ~1.0.0  →  ~2.0.0')

      // package file should include upgrades
      pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    })

    it('custom install script with --doctorInstall', async function () {
      // use dynamic import for ESM module
      const { default: stripAnsi } = await import('strip-ansi')
      const cwd = path.join(doctorTests, 'custominstall')
      const pkgPath = path.join(cwd, 'package.json')
      const lockfilePath = path.join(cwd, 'package-lock.json')
      const nodeModulesPath = path.join(cwd, 'node_modules')
      const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      let stdout = ''
      let stderr = ''

      try {
        await ncu(['--doctor', '-u', '--doctorInstall', npmCmd + ' run myinstall'], {
          cwd,
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        })
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      rimraf.sync(lockfilePath)
      rimraf.sync(nodeModulesPath)

      // stderr should be empty
      stderr.should.equal('')

      // stdout should include normal output
      stripAnsi(stdout).should.containIgnoreCase('Tests pass')

      // package file should include upgrades
      pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    })

    it('custom test script with --doctorTest', async function () {
      // use dynamic import for ESM module
      const { default: stripAnsi } = await import('strip-ansi')
      const cwd = path.join(doctorTests, 'customtest')
      const pkgPath = path.join(cwd, 'package.json')
      const lockfilePath = path.join(cwd, 'package-lock.json')
      const nodeModulesPath = path.join(cwd, 'node_modules')
      const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      let stdout = ''
      let stderr = ''

      try {
        await ncu(['--doctor', '-u', '--doctorTest', npmCmd + ' run mytest'], {
          cwd,
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        })
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      rimraf.sync(lockfilePath)
      rimraf.sync(nodeModulesPath)

      // stderr should be empty
      stderr.should.equal('')

      // stdout should include normal output
      stripAnsi(stdout).should.containIgnoreCase('Tests pass')

      // package file should include upgrades
      pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    })

    it('custom test script with --doctorTest command that includes spaced words wrapped in quotes', async function () {
      // use dynamic import for ESM module
      const { default: stripAnsi } = await import('strip-ansi')
      const cwd = path.join(doctorTests, 'customtest2')
      const pkgPath = path.join(cwd, 'package.json')
      const lockfilePath = path.join(cwd, 'package-lock.json')
      const nodeModulesPath = path.join(cwd, 'node_modules')
      const echoPath = path.join(cwd, 'echo.js')
      const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
      let stdout = ''
      let stderr = ''

      try {
        await ncu(['--doctor', '-u', '--doctorTest', `node ${echoPath} '123 456'`], {
          cwd,
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        })
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      rimraf.sync(lockfilePath)
      rimraf.sync(nodeModulesPath)

      // stderr should be empty
      stderr.should.equal('')

      // stdout should include expected output
      stripAnsi(stdout).should.contain("'123 456'")

      // package file should include upgrades
      pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    })

    it('handle failed prepare script', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgPath = path.join(tempDir, 'package.json')
      await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))

      /*
        - package.json
        - tsconfig.json
        - src/
          - index.ts
      */

      // package.json
      await fs.writeFile(
        pkgPath,
        JSON.stringify({
          scripts: {
            prepare: 'tsc',
            test: 'echo "No tests"',
          },
          devDependencies: {
            '@types/node': '18.0.0',
            typescript: '4.7.4',
          },
          dependencies: {
            '@kayahr/eddb': '^1.0.0',
          },
        }),
        'utf-8',
      )

      // tsconfig.json
      await fs.writeFile(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            rootDir: 'src',
            outDir: 'lib',
          },
        }),
        'utf-8',
      )

      // src/index.ts
      await fs.mkdir(path.join(tempDir, 'src'))
      await fs.writeFile(
        path.join(tempDir, 'src/index.ts'),
        `import { createFactories } from "@kayahr/eddb"

console.log(createFactories())`,
        'utf-8',
      )

      let stdout = ''
      let stderr = ''
      let pkgUpgraded

      try {
        // explicitly set packageManager to avoid auto yarn detection
        await spawn('npm', ['install'], { cwd: tempDir })

        await ncu(['--doctor', '-u', '-p', 'npm'], {
          cwd: tempDir,
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        })

        pkgUpgraded = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }

      // stdout should include successful upgrades
      stdout.should.containIgnoreCase('@types/node 18.0.0 →')
      stdout.should.not.containIgnoreCase('@kayahr/eddb ^1.0.0 →')

      // stderr should include failed prepare script
      stderr.should.containIgnoreCase('Prepare script failed')
      stderr.should.containIgnoreCase('@kayahr/eddb ^1.0.0 →')
      stderr.should.not.containIgnoreCase('@types/node → 18.0.0')

      // package file should only include successful upgrades
      pkgUpgraded.dependencies.should.deep.equal({
        '@kayahr/eddb': '^1.0.0',
      })
      pkgUpgraded.devDependencies.should.not.deep.equal({
        '@types/node': '18.0.0',
      })
    })
  })

  describe('yarn', () => {
    testPass({ packageManager: 'yarn' })
    testFail({ packageManager: 'yarn' })
  })

  describe('bun', () => {
    // TODO: fix doctor bun tests
    // testPass({ packageManager: 'bun' })
    // testFail({ packageManager: 'bun' })
  })
})
