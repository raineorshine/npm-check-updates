import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import { cliOptionsMap } from '../src/cli-options'
import { chalkInit } from '../src/lib/chalk'
import chaiSetup from './helpers/chaiSetup'
import { testFail, testPass } from './helpers/doctorHelpers'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')
const doctorTests = path.join(__dirname, 'test-data/doctor')

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

/** Run the ncu CLI. */
const ncu = async (
  args: string[],
  spawnPleaseOptions?: Parameters<typeof spawn>[2],
  spawnOptions?: Parameters<typeof spawn>[3],
) => {
  const { stdout } = await spawn('node', [bin, ...args], spawnPleaseOptions, spawnOptions)
  return stdout
}

describe('doctor', function () {
  // 3 min timeout
  this.timeout(3 * 60 * 1000)

  let stub: { restore: () => void }
  before(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
  after(() => stub.restore())

  describe('npm', () => {
    it('print instructions when -u is not specified', async () => {
      await chalkInit()
      const { default: stripAnsi } = await import('strip-ansi')
      const cwd = path.join(doctorTests, 'nopackagefile')
      const output = await ncu(['--doctor'], {}, { cwd })
      return stripAnsi(output).should.equal(
        `Usage: ncu --doctor\n\n${stripAnsi(
          (cliOptionsMap.doctor.help as (options: { markdown: boolean }) => string)({ markdown: false }),
        )}\n`,
      )
    })

    it('throw an error if there is no package file', async () => {
      const cwd = path.join(doctorTests, 'nopackagefile')
      return ncu(['--doctor', '-u'], {}, { cwd }).should.eventually.be.rejectedWith('Missing or invalid package.json')
    })

    it('throw an error if there is no test script', async () => {
      const cwd = path.join(doctorTests, 'notestscript')
      return ncu(['--doctor', '-u'], {}, { cwd }).should.eventually.be.rejectedWith('No npm "test" script')
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
        await ncu(
          ['--doctor', '-u', '--filter', 'ncu-test-v2'],
          {
            stdout: function (data: string) {
              stdout += data
            },
            stderr: function (data: string) {
              stderr += data
            },
          },
          { cwd },
        )
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      await fs.rm(lockfilePath, { recursive: true, force: true })
      await fs.rm(nodeModulesPath, { recursive: true, force: true })

      // stderr should be empty or equal to the test script output (output varies by platform/node version)
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        stderr.should.equal(`> test
> node test.js



> test
> node test.js`)
      }

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
        await ncu(
          ['--doctor', '-u', '--doctorInstall', npmCmd + ' run myinstall'],
          {
            stdout: function (data: string) {
              stdout += data
            },
            stderr: function (data: string) {
              stderr += data
            },
          },
          { cwd },
        )
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      await fs.rm(lockfilePath, { recursive: true, force: true })
      await fs.rm(nodeModulesPath, { recursive: true, force: true })

      // stderr should be empty or equal to the test script output (output varies by platform/node version)
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        stripAnsi(stderr).should.equal(`> test
> echo 'Test Success'



> test
> echo 'Test Success'`)
      }

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
        await ncu(
          ['--doctor', '-u', '--doctorTest', npmCmd + ' run mytest'],
          {
            stdout: function (data: string) {
              stdout += data
            },
            stderr: function (data: string) {
              stderr += data
            },
          },
          { cwd },
        )
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      await fs.rm(lockfilePath, { recursive: true, force: true })
      await fs.rm(nodeModulesPath, { recursive: true, force: true })

      // stderr should be empty or equal to the test script output (output varies by platform/node version)
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        stderr.should.equal(`> mytest
> echo Success



> mytest
> echo Success`)
      }

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
        await ncu(
          ['--doctor', '-u', '--doctorTest', `node ${echoPath} '123 456'`],
          {
            stdout: function (data: string) {
              stdout += data
            },
            stderr: function (data: string) {
              stderr += data
            },
          },
          { cwd },
        )
      } catch (e) {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      await fs.rm(lockfilePath, { recursive: true, force: true })
      await fs.rm(nodeModulesPath, { recursive: true, force: true })

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

      // package.json
      await fs.writeFile(
        pkgPath,
        JSON.stringify({
          scripts: {
            prepare: 'node prepare.js',
            test: 'echo "No tests"',
          },
          dependencies: {
            'ncu-test-v2': '1.0.0',
            'ncu-test-tag': '1.0.0',
          },
        }),
        'utf-8',
      )

      // prepare.js
      // A script that fails if ncu-test-v2 is not at 1.0.0.
      // This is an arbitrary fail condition used to test that doctor mode still works when the npm prepare script fails.
      await fs.writeFile(
        path.join(tempDir, 'prepare.js'),
        `const ncuTestPkg = require('./node_modules/ncu-test-v2/package.json')

if (ncuTestPkg.version === '1.0.0') {
  console.log('done')
  process.exit(0)
}
else {
  console.error('failed')
  process.exit(1)
}`,
        'utf-8',
      )

      let stdout = ''
      let stderr = ''
      let pkgUpgraded

      try {
        // explicitly set packageManager to avoid auto yarn detection
        await spawn('npm', ['install'], {}, { cwd: tempDir })

        await ncu(
          ['--doctor', '-u', '-p', 'npm'],
          {
            stdout: function (data: string) {
              stdout += data
            },
            stderr: function (data: string) {
              stderr += data
            },
          },
          { cwd: tempDir },
        )

        pkgUpgraded = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }

      // stdout should include successful upgrades
      stdout.should.containIgnoreCase('ncu-test-tag 1.0.0 →')
      stdout.should.not.containIgnoreCase('ncu-test-v2 1.0.0 →')

      // stderr should include failed prepare script
      stderr.should.containIgnoreCase('failed')
      stderr.should.containIgnoreCase('ncu-test-v2 1.0.0 →')
      stderr.should.not.containIgnoreCase('ncu-test-tag 1.0.0 →')

      // package file should only include successful upgrades
      pkgUpgraded.dependencies.should.deep.equal({
        'ncu-test-v2': '1.0.0',
        'ncu-test-tag': '1.1.0',
      })
    })
  })

  describe('yarn', () => {
    testPass({ packageManager: 'yarn' })
    testFail({ packageManager: 'yarn' })
  })
})
