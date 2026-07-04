import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cliOptionsMap } from '../src/cli-options.ts'
import { chalkInit } from '../src/lib/chalk.ts'
import { copyFixture, createNcuRegExp, testFail, testPass } from './helpers/doctorHelpers.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

// 3 min timeout
describe('doctor', { timeout: 3 * 60 * 1000 }, () => {
  let stub: { restore: () => void }
  beforeAll(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
  afterAll(() => stub.restore())

  describe('npm', () => {
    it('print instructions when -u is not specified', async () => {
      chalkInit()
      const cwd = path.join(doctorTests, 'nopackagefile')
      const output = await ncu(['--doctor'], {}, { cwd })
      expect(stripAnsi(output)).toBe(
        `Usage: ncu --doctor\n\n${stripAnsi(
          (cliOptionsMap.doctor.help as (options: { markdown: boolean }) => string)({ markdown: false }),
        )}\n`,
      )
    })

    it('throw an error if there is no package file', async () => {
      const cwd = path.join(doctorTests, 'nopackagefile')
      await expect(ncu(['--doctor', '-u'], {}, { cwd })).rejects.toThrow('Missing or invalid package.json')
    })

    it('throw an error if there is no test script', async () => {
      const cwd = path.join(doctorTests, 'notestscript')
      await expect(ncu(['--doctor', '-u'], {}, { cwd })).rejects.toThrow('No npm "test" script')
    })

    it('throw an error if --packageData or --packageFile are supplied', async () => {
      await Promise.all([
        expect(ncu(['--doctor', '-u', '--packageFile', 'package.json'])).rejects.toThrow(
          '--packageData and --packageFile are not allowed with --doctor',
        ),
        expect(ncu(['--doctor', '-u', '--packageData', '{}'])).rejects.toThrow(
          '--packageData and --packageFile are not allowed with --doctor',
        ),
      ])
    })

    testPass({ packageManager: 'npm' })
    testFail({ packageManager: 'npm' })

    it('pass through options', async () => {
      const cwd = await copyFixture('options')
      const pkgPath = path.join(cwd, 'package.json')
      let stdout = ''
      let stderr = ''
      let pkgUpgraded

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

      try {
        pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')
      } finally {
        await removeDir(cwd)
      }

      // stderr should be empty or equal to the test script output (output varies by platform/node version)
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        expect(stderr).toBe(`> test
> node test.js



> test
> node test.js`)
      }

      // stdout should include normal output
      expect(stripAnsi(stdout).toLowerCase()).toContain('Tests pass'.toLowerCase())
      expect(stripAnsi(stdout).toLowerCase()).toContain('ncu-test-v2  ~1.0.0  →  ~2.0.0'.toLowerCase())

      // package file should include upgrades
      expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
    })

    // https://github.com/raineorshine/npm-check-updates/issues/1441
    it('upgrade dependencies with --errorLevel 2', async () => {
      const cwd = path.join(doctorTests, 'options')
      const pkgPath = path.join(cwd, 'package.json')
      const lockfilePath = path.join(cwd, 'package-lock.json')
      const nodeModulesPath = path.join(cwd, 'node_modules')
      const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
      let stdout = ''
      let stderr = ''

      try {
        await ncu(
          ['--doctor', '-u', '--errorLevel', '2', '--filter', 'ncu-test-v2'],
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
      } catch {}

      const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      await fs.writeFile(pkgPath, pkgOriginal)
      await fs.rm(lockfilePath, { recursive: true, force: true })
      await fs.rm(nodeModulesPath, { recursive: true, force: true })

      // errorLevel 2 must not abort the internal upgrade run
      expect(stripAnsi(stderr)).not.toContain('Dependencies not up-to-date')
      expect(stripAnsi(stdout).toLowerCase()).toContain('Tests pass'.toLowerCase())
      expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
    })

    it('custom install script with --doctorInstall', async () => {
      const cwd = await copyFixture('custominstall')
      const pkgPath = path.join(cwd, 'package.json')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      let stdout = ''
      let stderr = ''
      let pkgUpgraded

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

      try {
        pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')
      } finally {
        await removeDir(cwd)
      }

      // stderr should be empty or equal to the test script output (output varies by platform/node version)
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        expect(stripAnsi(stderr)).toBe(`> test
> echo 'Test Success'



> test
> echo 'Test Success'`)
      }

      // stdout should include normal output
      expect(stripAnsi(stdout).toLowerCase()).toContain('Tests pass'.toLowerCase())

      // package file should include upgrades
      expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
    })

    it('custom test script with --doctorTest', async () => {
      const cwd = await copyFixture('customtest')
      const pkgPath = path.join(cwd, 'package.json')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      let stdout = ''
      let stderr = ''
      let pkgUpgraded

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

      try {
        pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')
      } finally {
        await removeDir(cwd)
      }

      // stderr should be empty or equal to the test script output (output varies by platform/node version)
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        expect(stderr).toBe(`> mytest
> echo Success



> mytest
> echo Success`)
      }

      // stdout should include normal output
      expect(stripAnsi(stdout).toLowerCase()).toContain('Tests pass'.toLowerCase())

      // package file should include upgrades
      expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
    })

    it('custom test script with --doctorTest command that includes spaced words wrapped in quotes', async () => {
      const cwd = await copyFixture('customtest2')
      const pkgPath = path.join(cwd, 'package.json')
      const echoPath = path.join(cwd, 'echo.js')
      let stdout = ''
      let stderr = ''
      let pkgUpgraded

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

      try {
        pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')
      } finally {
        await removeDir(cwd)
      }

      // stderr should be empty
      expect(stderr).toBe('')

      // stdout should include expected output
      expect(stripAnsi(stdout)).toContain("'123 456'")

      // package file should include upgrades
      expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
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
        `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ncuTestPkg = require('./node_modules/ncu-test-v2/package.json');
if (ncuTestPkg.version === '1.0.0') {
  console.log('done')
  process.exitCode = 0;
}
else {
  console.error('failed')
  process.exitCode = 1;
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
        await removeDir(tempDir)
      }

      const testTag = createNcuRegExp('ncu-test-tag 1.0.0 →')
      const testV2 = createNcuRegExp('ncu-test-v2 1.0.0 →')

      // stdout should include successful upgrades
      expect(stdout).toMatch(testTag)
      expect(stdout).not.toMatch(testV2)

      // stderr should include failed prepare script
      expect(stderr.toLowerCase()).toContain('failed'.toLowerCase())
      expect(stderr).toMatch(testV2)
      expect(stderr).not.toMatch(testTag)

      // package file should only include successful upgrades
      expect(pkgUpgraded.dependencies).toStrictEqual({
        'ncu-test-v2': '1.0.0',
        'ncu-test-tag': '1.1.0',
      })
    })
  })

  describe('yarn', () => {
    // yarn classic drops yarn--<timestamp> proxy-script dirs in the temp dir and does not reliably clean them up
    let preexistingYarnTmp: Set<string>

    beforeAll(async () => {
      const entries = await fs.readdir(os.tmpdir())
      preexistingYarnTmp = new Set(entries.filter(entry => entry.startsWith('yarn--')))
    })

    afterAll(async () => {
      const entries = await fs.readdir(os.tmpdir())
      await Promise.all(
        entries
          .filter(entry => entry.startsWith('yarn--') && !preexistingYarnTmp.has(entry))
          .map(entry => removeDir(path.join(os.tmpdir(), entry))),
      )
    })

    testPass({ packageManager: 'yarn' })
    testFail({ packageManager: 'yarn' })
  })
})
