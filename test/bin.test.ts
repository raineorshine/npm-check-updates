import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { describe, expect, it } from 'vitest'
import { type Index } from '../src/types/IndexType.ts'
import { type Version } from '../src/types/Version.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')

describe('bin', () => {
  it('fetch latest version from registry (not stubbed)', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    const pkgData = JSON.parse(stdout)
    expect(pkgData).toHaveProperty('ncu-test-v2')
  })

  it('output only upgraded with --jsonUpgraded', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    const pkgData = JSON.parse(stdout)
    expect(pkgData).toHaveProperty('ncu-test-v2')
    stub.restore()
  })

  it('--loglevel verbose', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--loglevel', 'verbose'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    expect(stdout.toLowerCase()).toContain('Initializing'.toLowerCase())
    expect(stdout.toLowerCase()).toContain('Running in local mode'.toLowerCase())
    expect(stdout.toLowerCase()).toContain('Finding package file data'.toLowerCase())
    stub.restore()
  })

  it('--verbose', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--verbose'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    expect(stdout.toLowerCase()).toContain('Initializing'.toLowerCase())
    expect(stdout.toLowerCase()).toContain('Running in local mode'.toLowerCase())
    expect(stdout.toLowerCase()).toContain('Finding package file data'.toLowerCase())
    stub.restore()
  })

  it('accept stdin', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin'], {
      stdin: JSON.stringify({ dependencies: { express: '1' } }),
    })
    expect(stdout).toContain('express')
    stub.restore()
  })

  it('group by update type by default', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin'], {
      stdin: JSON.stringify({ dependencies: { express: '1.0.0' } }),
    })
    expect(stripAnsi(stdout)).toContain('Major   Potentially breaking API changes')
    stub.restore()
  })

  it('reject out-of-date stdin with errorLevel 2', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    await expect(
      spawn('node', [bin, '--stdin', '--errorLevel', '2'], {
        stdin: JSON.stringify({ dependencies: { express: '1' } }),
      }),
    ).rejects.toThrow('Dependencies not up-to-date')
    stub.restore()
  })

  it('fall back to package.json search when receiving empty content on stdin', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin'])
    expect(stdout.toString().trim()).toMatch(/^Checking .+package.json/)
    stub.restore()
  })

  it('use package.json in cwd by default', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded'], {}, { cwd: path.join(__dirname, 'test-data/ncu') })
    const pkgData = JSON.parse(stdout)
    expect(pkgData).toHaveProperty('express')
    stub.restore()
  })

  it('throw error if there is no package', async () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    await expect(spawn('node', [bin], {}, { cwd: os.tmpdir() })).rejects.toThrow('No package.json')
  })

  it('throw error if there is no package in --cwd', async () => {
    await expect(spawn('node', [bin, '--cwd', os.tmpdir()])).rejects.toThrow('No package.json')
  })

  it('throw error if --cwd does not exist', async () => {
    await expect(spawn('node', [bin, '--cwd', 'fnuoathufoawhtufonwauto'])).rejects.toThrow(
      'No such directory: fnuoathufoawhtufonwauto',
    )
  })

  it('read --packageFile', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { express: '1' } }), 'utf-8')
    try {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--packageFile', pkgFile])
      const pkgData = JSON.parse(stdout)
      expect(pkgData).toHaveProperty('express')
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  it('write to --packageFile', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { express: '1' } }), 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--packageFile', pkgFile])
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      expect(upgradedPkg).toHaveProperty('dependencies')
      expect(upgradedPkg.dependencies).toHaveProperty('express')
      expect(upgradedPkg.dependencies.express).not.toBe('1')
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  it('write to --packageFile if errorLevel=2 and upgrades', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { express: '1' } }), 'utf-8')

    try {
      await expect(spawn('node', [bin, '-u', '--errorLevel', '2', '--packageFile', pkgFile])).rejects.toThrow(
        'Dependencies not up-to-date',
      )
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      expect(upgradedPkg).toHaveProperty('dependencies')
      expect(upgradedPkg.dependencies).toHaveProperty('express')
      expect(upgradedPkg.dependencies.express).not.toBe('1')
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  it('write to --packageFile with jsonUpgraded flag', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { express: '1' } }), 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--jsonUpgraded', '--packageFile', pkgFile])
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      expect(upgradedPkg).toHaveProperty('dependencies')
      expect(upgradedPkg.dependencies).toHaveProperty('express')
      expect(upgradedPkg.dependencies.express).not.toBe('1')
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  it('ignore stdin if --packageFile is specified', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { express: '1' } }), 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--stdin', '--packageFile', pkgFile], {
        stdin: JSON.stringify({ dependencies: {} }),
      })
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      expect(upgradedPkg).toHaveProperty('dependencies')
      expect(upgradedPkg.dependencies).toHaveProperty('express')
      expect(upgradedPkg.dependencies.express).not.toBe('1')
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  it('suppress stdout when --silent is provided', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--silent'], {
      stdin: JSON.stringify({ dependencies: { express: '1' } }),
    })
    expect(stdout.trim()).toBe('')
    stub.restore()
  })

  it('quote arguments with spaces in upgrade hint', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const pkgData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
        'ncu-test-tag': '^1.0.0',
      },
    }
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')
    try {
      const { stdout } = await spawn('node', [bin, '--packageFile', pkgFile, '--filter', 'ncu-test-v2 ncu-test-tag'])
      expect(stdout).toContain('"ncu-test-v2 ncu-test-tag"')
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  it('ignore file: and link: protocols', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const dependencies = {
      editor: 'file:../editor',
      event: 'link:../link',
      workspace: 'workspace:../workspace',
    }
    const { stdout } = await spawn('node', [bin, '--stdin'], { stdin: JSON.stringify({ dependencies }) })

    expect(stripAnsi(stdout)!).not.toContain('No package versions were returned.')
    stub.restore()
  })

  it('do not warn about empty results when every dep is already at the highest version for non-latest --target', async () => {
    const stub = stubVersions({ 'ncu-test-v2': '1.0.0' }, { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin', '--target', 'minor'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    const out = stripAnsi(stdout)!
    expect(out).not.toContain('No package versions were returned.')
    expect(out).toContain('All dependencies match the minor package versions')
    stub.restore()
  })

  it('combine boolean flags with arguments', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin', '--jsonUpgraded', 'ncu-test-v2'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '0.1.0' } }),
    })
    const upgraded = JSON.parse(stdout) as Index<Version>
    expect(upgraded).toStrictEqual({
      'ncu-test-v2': '99.9.9',
    })
    stub.restore()
  })

  it('combine short boolean options with long options', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const promise = spawn('node', [bin, '-mp', 'foo'])
    await expect(promise).rejects.toThrow('Invalid package manager: foo')
    stub.restore()
  })

  // TODO
  // https://github.com/raineorshine/npm-check-updates/issues/1594
  it.skip('upgrade duplicate dependencies with different versions', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' }, devDependencies: { 'ncu-test-v2': '1.0.1' } }),
      'utf-8',
    )
    try {
      await spawn('node', [bin, '-u', '--packageFile', pkgFile])
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      console.log(upgradedPkg)
      expect(upgradedPkg.dependencies).toStrictEqual({ 'ncu-test-v2': '99.9.9' })
      expect(upgradedPkg.devDependencies).toStrictEqual({ 'ncu-test-v2': '99.9.9' })
    } finally {
      await removeDir(tempDir)
      stub.restore()
    }
  })

  describe('embedded versions', () => {
    it('strip url from GitHub url in "to" output', async () => {
      const dependencies = {
        'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2.git#v1.0.0',
      }
      const { stdout } = await spawn('node', [bin, '--stdin'], { stdin: JSON.stringify({ dependencies }) })
      expect(
        stripAnsi(stdout).trim().replace(/\s+/g, ' '), // Replace all whitespace sequences with a single space
      ).toContain('ncu-test-v2 https://github.com/raineorshine/ncu-test-v2.git#v1.0.0 → v2.0.0')
    })

    it('strip prefix from npm alias in "to" output', async () => {
      const stub = stubVersions('99.9.9', { spawn: true })
      const dependencies = {
        request: 'npm:ncu-test-v2@1.0.0',
      }
      const { stdout } = await spawn('node', [bin, '--stdin'], { stdin: JSON.stringify({ dependencies }) })
      expect(stripAnsi(stdout).replace(/\s+/g, ' ')).toContain('request npm:ncu-test-v2@1.0.0 → 99.9.9')
      stub.restore()
    })
  })

  describe('option-specific help', () => {
    it('long option', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--filter'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --filter/)
    })

    it('long option without "--" prefix', async () => {
      const { stdout } = await spawn('node', [bin, '--help', 'filter'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --filter/)
    })

    it('short option', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '-f'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --filter/)
    })

    it('short option without "-" prefix', async () => {
      const { stdout } = await spawn('node', [bin, '--help', 'f'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --filter/)
    })

    it('option with default', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--concurrency'])
      expect(stdout.trim().toLowerCase()).toContain('Default:'.toLowerCase())
    })

    it('option with extended help', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--target'])
      expect(stdout.trim().toLowerCase()).toContain('Upgrade to the highest version number'.toLowerCase())
    })

    it('-h', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--filter'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --filter/)
    })

    it('unknown option', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--foo'])
      expect(stdout.trim().toLowerCase()).toContain('Unknown option'.toLowerCase())
    })

    it('multiple options', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--interactive', '--minimal'])
      expect(stdout.trim().toLowerCase()).toContain('ncu --interactive'.toLowerCase())
      expect(stdout.trim().toLowerCase()).toContain('ncu --minimal'.toLowerCase())
    })

    // version is a special case since it is not included in cli-options.ts
    it('--version', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--version'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --version/)
    })

    it('-V', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--version'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --version/)
    })

    it('-v', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--version'])
      expect(stdout.trim()).toMatch(/^Usage:\s+ncu --version/)
    })

    describe('special --help help', () => {
      it('--help --help', async () => {
        const { stdout } = await spawn('node', [bin, '--help', '--help'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('--help help', async () => {
        const { stdout } = await spawn('node', [bin, '--help', 'help'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('--help -h', async () => {
        const { stdout } = await spawn('node', [bin, '--help', '-h'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('--help h', async () => {
        const { stdout } = await spawn('node', [bin, '--help', 'h'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('-h --help', async () => {
        const { stdout } = await spawn('node', [bin, '-h', '--help'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('-h help', async () => {
        const { stdout } = await spawn('node', [bin, '-h', 'help'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('-h -h', async () => {
        const { stdout } = await spawn('node', [bin, '-h', '-h'])
        expect(stdout.trim()).not.toContain('Usage')
      })

      it('-h h', async () => {
        const { stdout } = await spawn('node', [bin, '-h', 'h'])
        expect(stdout.trim()).not.toContain('Usage')
      })
    })
  })
})
