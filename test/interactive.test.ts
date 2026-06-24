import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import removeDir from './helpers/removeDir'
import { runNcuCli } from './helpers/runNcuCli'
import stubVersions from './helpers/stubVersions'

describe('--interactive', () => {
  let stub: { mockRestore: () => void }
  beforeEach(() => {
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

  afterEach(() => {
    stub.mockRestore()
  })

  it('prompt for each upgraded dependency', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      const { stdout } = await runNcuCli(['--interactive'], {
        cwd: tempDir,
        inject: [['ncu-test-v2', 'ncu-test-return-version'], true],
      })

      should.equal(/^Upgrading/m.test(stdout), true)

      // do not show install hint when choosing auto-install
      should.equal(/^Run npm install to install new versions.$/m.test(stdout), false)

      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })
    } finally {
      await removeDir(tempDir)
    }
  })

  it('with --format group', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      await runNcuCli(['--interactive', '--format', 'group'], {
        cwd: tempDir,
        inject: [['ncu-test-v2', 'ncu-test-return-version'], true],
      })

      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })

      // prompts does not print during injection, so we cannot assert the output in interactive mode
    } finally {
      await removeDir(tempDir)
    }
  })

  it('with --format group and custom group function', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
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
    try {
      await runNcuCli(['--interactive', '--format', 'group', '--configFilePath', tempDir], {
        cwd: tempDir,
        inject: [['ncu-test-v2', 'ncu-test-return-version'], true],
      })

      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })

      // prompts does not print during injection, so we cannot assert the output in interactive mode
    } finally {
      await removeDir(tempDir)
    }
  })

  it('with --format repo', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
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
    const modernDiacriticsPath = path.join(tempDir, 'node_modules', 'modern-diacritics')
    await fs.mkdir(modernDiacriticsPath, { recursive: true })
    const modernDiacriticsPkgFile = path.join(modernDiacriticsPath, 'package.json')
    await fs.writeFile(
      modernDiacriticsPkgFile,
      JSON.stringify({ repository: 'https://github.com/Mitsunee/modern-diacritics' }),
      'utf-8',
    )
    try {
      const { stdout } = await runNcuCli(['--interactive', '--format', 'repo'], {
        cwd: tempDir,
        inject: [['modern-diacritics'], true],
      })

      stdout.should.include('https://github.com/Mitsunee/modern-diacritics')
    } finally {
      await removeDir(tempDir)
    }
  })
})
