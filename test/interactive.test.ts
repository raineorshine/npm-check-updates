import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'spawn-please'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import makeTempDir from './helpers/makeTempDir.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')

describe('--interactive', () => {
  let stub: { restore: () => void }
  beforeAll(() => {
    stub = stubVersions(
      {
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '1.1.0',
        'ncu-test-return-version': '2.0.0',
        // this must be a real version for --format repo to work
        'modern-diacritics': '2.0.0',
      },
      { spawn: true },
    )
  })
  afterAll(() => {
    stub.restore()
  })

  it('prompt for each upgraded dependency', async () => {
    const tempDir = await makeTempDir()
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    onTestFinished(() => removeDir(tempDir))
    const { stdout } = await spawn(
      'node',
      [bin, '--interactive'],
      {},
      {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], true]),
        },
      },
    )

    expect(/^Upgrading/m.test(stdout)).toBe(true)

    // do not show install hint when choosing auto-install
    expect(/^Run npm install to install new versions.$/m.test(stdout)).toBe(false)

    const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
    expect(upgradedPkg.dependencies).toStrictEqual({
      // upgraded
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      // no upgraded
      'ncu-test-tag': '1.0.0',
    })
  })

  it('with --format group', async () => {
    const tempDir = await makeTempDir()
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    onTestFinished(() => removeDir(tempDir))
    await spawn(
      'node',
      [bin, '--interactive', '--format', 'group'],
      {},
      {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], true]),
        },
      },
    )

    const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
    expect(upgradedPkg.dependencies).toStrictEqual({
      // upgraded
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      // no upgraded
      'ncu-test-tag': '1.0.0',
    })

    // prompts does not print during injection, so we cannot assert the output in interactive mode
  })

  it('with --format no-group', async () => {
    const tempDir = await makeTempDir()
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    onTestFinished(() => removeDir(tempDir))
    await spawn(
      'node',
      [bin, '--interactive', '--format', 'no-group'],
      {},
      {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], true]),
        },
      },
    )

    const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
    expect(upgradedPkg.dependencies).toStrictEqual({
      // upgraded
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      // no upgraded
      'ncu-test-tag': '1.0.0',
    })

    // prompts does not print during injection, so we cannot assert the output in interactive mode
  })

  it('with --format group and custom group function', async () => {
    const tempDir = await makeTempDir()
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.0',
          'ncu-test-tag': '1.0.0',
        },
      }),
      'utf-8',
    )
    const configFile = path.join(tempDir, '.ncurc.js')
    await fs.writeFile(configFile, `module.exports = { groupFunction: () => 'minor' }`, 'utf-8')
    onTestFinished(() => removeDir(tempDir))
    await spawn(
      'node',
      [bin, '--interactive', '--format', 'group', '--configFilePath', tempDir],
      {},
      {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], true]),
        },
      },
    )

    const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
    expect(upgradedPkg.dependencies).toStrictEqual({
      // upgraded
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      // no upgraded
      'ncu-test-tag': '1.0.0',
    })

    // prompts does not print during injection, so we cannot assert the output in interactive mode
  })

  it('with --format repo', async () => {
    const tempDir = await makeTempDir()
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'modern-diacritics': '^1.0.0',
        },
      }),
      'utf-8',
    )
    onTestFinished(() => removeDir(tempDir))
    await spawn('npm', ['install'], {}, { cwd: tempDir })
    const { stdout } = await spawn(
      'node',
      [bin, '--interactive', '--format', 'repo'],
      {},
      {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['modern-diacritics'], true]),
        },
      },
    )

    expect(stdout).toContain('https://github.com/Mitsunee/modern-diacritics')
  })
  // Pre-selection cannot be observed end-to-end, since INJECT_PROMPTS replaces the prompt entirely.
  // See test/interactiveSelect.test.ts for the pre-selected state and test/isPreSelected.test.ts for the logic itself.
  describe('--interactiveSelect', () => {
    it('rejects an invalid value', async () => {
      const tempDir = await makeTempDir()
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }), 'utf-8')
      onTestFinished(() => removeDir(tempDir))
      await expect(
        spawn('node', [bin, '--interactive', '--interactiveSelect', 'bogus'], {}, { cwd: tempDir }),
      ).rejects.toThrow(
        'Invalid option value: --interactiveSelect bogus. Valid values are: auto, none, patch, minor, all.',
      )
    })

    it('accepts a valid value', async () => {
      const tempDir = await makeTempDir()
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        pkgFile,
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '1.0.0' } }),
        'utf-8',
      )
      onTestFinished(() => removeDir(tempDir))
      await spawn(
        'node',
        [bin, '--interactive', '--interactiveSelect', 'none'],
        {},
        {
          cwd: tempDir,
          env: {
            ...process.env,
            INJECT_PROMPTS: JSON.stringify([['ncu-test-v2'], true]),
          },
        },
      )

      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      expect(upgradedPkg.dependencies).toStrictEqual({
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '1.0.0',
      })
    })
  })
})
