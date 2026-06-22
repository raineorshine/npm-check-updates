import fs from 'fs/promises'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import os from 'os'
import path from 'path'
import { cliOptionsMap } from '../src/cli-options'
import { chalkInit } from '../src/lib/chalk'
import { createNcuRegExp, testFail, testPass } from './helpers/doctorHelpers'
import removeDir from './helpers/removeDir'
import { runNcuCli } from './helpers/runNcuCli'
import stubVersions from './helpers/stubVersions'
import { doctorSpawnHandler } from './helpers/stubs/stubDoctor'
import { stubSpawnPlease } from './helpers/stubs/stubSpawnPlease'

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

describe('doctor', function () {
  let stub: { mockRestore: () => void }

  beforeAll(async () => {
    stubSpawnPlease.useFirst(doctorSpawnHandler)
  })

  beforeEach(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
  afterEach(() => stub.mockRestore())

  afterAll(async () => {
    vi.restoreAllMocks()
    sandbox.cleanup()
  })

  describe('npm', () => {
    it('print instructions when -u is not specified', async () => {
      chalkInit()
      const cwd = await sandbox.createTestFolder('doctor/nopackagefile')
      const { stdout } = await runNcuCli(['--doctor'], { cwd })
      return stripAnsi(stdout).should.equal(
        `Usage: ncu --doctor\n\n${stripAnsi(
          (cliOptionsMap.doctor.help as (options: { markdown: boolean }) => string)({ markdown: false }),
        )}\n`,
      )
    })

    it('throw an error if there is no package file', async () => {
      const cwd = await sandbox.createTestFolder('doctor/nopackagefile')
      return runNcuCli(['--doctor', '-u'], { cwd }).should.eventually.be.rejectedWith('Missing or invalid package.json')
    })

    it('throw an error if there is no test script', async () => {
      const cwd = await sandbox.createTestFolder('doctor/notestscript')
      return runNcuCli(['--doctor', '-u'], { cwd }).should.eventually.be.rejectedWith('No npm "test" script')
    })

    it('throw an error if --packageData or --packageFile are supplied', async () => {
      await sandbox.createPackageJson()
      await Promise.all([
        runNcuCli(['--doctor', '-u', '--packageFile', 'package.json']).should.eventually.be.rejectedWith(
          '--packageData and --packageFile are not allowed with --doctor',
        ),
        runNcuCli(['--doctor', '-u', '--packageData', '{}']).should.eventually.be.rejectedWith(
          '--packageData and --packageFile are not allowed with --doctor',
        ),
      ])
    })

    testPass({ packageManager: 'npm' })
    testFail({ packageManager: 'npm' })

    it('pass through options', async function () {
      const cwd = await sandbox.createTestFolder('doctor/options')
      const pkgPath = path.join(cwd, 'package.json')

      let { stdout, stderr } = await runNcuCli(['--doctor', '-u', '--filter', 'ncu-test-v2'], {
        rejectOnError: false,
        cwd,
      })

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

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
      const cwd = await sandbox.createTestFolder('doctor/custominstall')
      const pkgPath = path.join(cwd, 'package.json')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

      let { stdout, stderr } = await runNcuCli(['--doctor', '-u', '--doctorInstall', npmCmd + ' run myinstall'], {
        rejectOnError: false,
        cwd,
      })

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // spawn have been called with the right arguments
      const [cmd1, args1 = []] = stubSpawnPlease.spy.mock.calls.at(-2)!
      cmd1.should.equal(npmCmd)
      args1.join(' ').should.endsWith('run myinstall')
      // doctor run test after the custom install
      const [cmd2, args2 = []] = stubSpawnPlease.spy.mock.calls.at(-1)!
      cmd2.should.equal(npmCmd)
      args2.join(' ').should.endsWith('run test')

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
      const cwd = await sandbox.createTestFolder('doctor/customtest')
      const pkgPath = path.join(cwd, 'package.json')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

      let { stdout, stderr } = await runNcuCli(['--doctor', '-u', '--doctorTest', `${npmCmd} run mytest`], {
        rejectOnError: false,
        cwd,
      })

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // spawn have been called with the right arguments
      const [cmd, args = []] = stubSpawnPlease.spy.mock.calls.at(-1)!
      cmd.should.equal(npmCmd)
      args.join(' ').should.endsWith('run mytest')

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
      const cwd = await sandbox.createTestFolder('doctor/customtest2')
      const pkgPath = path.join(cwd, 'package.json')
      const echoPath = path.join(cwd, 'echo.js')

      const { stdout, stderr } = await runNcuCli(['--doctor', '-u', '--doctorTest', `node ${echoPath} '123 456'`], {
        rejectOnError: false,
        cwd,
      })

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // spawn have been called with the right arguments
      const [cmd, args = []] = stubSpawnPlease.spy.mock.calls.at(-1)!
      cmd.should.equal('node')
      args[0].should.equal(echoPath)
      args[1].should.endsWith('123 456')

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

      // package.json
      await fs.writeFile(
        pkgPath,
        JSON.stringify({
          type: 'module',
          scripts: {
            prepare: 'node prepare.js',
            test: 'echo "No tests"',
          },
          dependencies: {
            'ncu-test-return-version': '1.0.0',
            'ncu-test-tag': '1.0.0',
          },
        }),
        'utf-8',
      )

      // prepare.js
      await fs.writeFile(
        path.join(tempDir, 'prepare.js'),
        `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ncuTestPkg = require('./node_modules/ncu-test-return-version/package.json');
if (ncuTestPkg.version === '1.0.0') {
  console.log('done')
  process.exitCode = 0;
}
else {
  console.error('Breaks with v2.x :(')
  process.exitCode = 1;
}`,
        'utf-8',
      )

      // explicitly set packageManager to avoid auto yarn detection
      await stubSpawnPlease.spy('npm', ['install'], {}, { cwd: tempDir })
      const { stdout, stderr } = await runNcuCli(['--doctor', '-u', '-p', 'npm'], {
        rejectOnError: false,
        cwd: tempDir,
      })

      const pkgUpgraded = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))

      const testTag = createNcuRegExp('ncu-test-tag 1.0.0 →')
      const testV2 = createNcuRegExp('ncu-test-return-version 1.0.0 →')

      // stdout should include successful upgrades
      stdout.should.match(testTag)
      stdout.should.not.match(testV2)

      // stderr should include failed prepare script
      stderr.should.containIgnoreCase('Breaks with v2.x :(')
      stderr.should.match(testV2)
      stderr.should.not.match(testTag)

      // package file should only include successful upgrades
      pkgUpgraded.dependencies.should.deep.equal({
        'ncu-test-return-version': '1.0.0',
        'ncu-test-tag': '1.1.0',
      })

      await removeDir(tempDir)
    })
  })

  describe('yarn', () => {
    testPass({ packageManager: 'yarn' })
    testFail({ packageManager: 'yarn' })
  })
})
