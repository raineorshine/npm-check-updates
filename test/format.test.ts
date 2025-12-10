import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

/**
 * Helper function to remove a directory while avoiding errors like:
 * Error: EBUSY: resource busy or locked, rmdir 'C:\Users\alice\AppData\Local\Temp\npm-check-updates-yc1wT3'
 */
async function removeDir(dirPath: string) {
  while (true) {
    try {
      await fs.access(dirPath, fs.constants.W_OK)
    } catch {
      continue
    }

    break
  }

  await fs.rm(dirPath, { recursive: true, force: true })
}

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')

describe('format', () => {
  it('--format dep', async () => {
    const stub = stubVersions(
      {
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '2.0.0',
        'ncu-test-peer-update': '2.0.0',
        'ncu-test-return-version': '2.0.0',
      },
      { spawn: true },
    )
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
        },
        devDependencies: {
          'ncu-test-tag': '^1.0.0',
        },
        peerDependencies: {
          'ncu-test-peer-update': '^1.0.0',
        },
        optionalDependencies: {
          'ncu-test-return-version': '^1.0.0',
        },
      }),
      'utf-8',
    )
    try {
      const { stdout } = await spawn(
        'node',
        // -u was added to avoid accidentally matching dev, peer, optional from "Run ncu --dep prod,dev,peer,optional --format dep -u to upgrade package.json"
        [bin, '--dep', 'prod,dev,peer,optional', '--format', 'dep', '-u'],
        {},
        { cwd: tempDir },
      )

      stdout.should.include('dev')
      stdout.should.include('peer')
      stdout.should.include('optional')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
      stub.restore()
    }
  })

  // do not stubVersions here, because we need to test if if time is parsed correctly from npm-registry-fetch
  it('--format time', async () => {
    const timestamp = '2020-04-27T21:48:11.660Z'
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
      },
    }
    const { stdout } = await spawn('node', [bin, '--format', 'time', '--stdin'], { stdin: JSON.stringify(packageData) })
    expect(stdout).contains(timestamp)
  })

  it('--format repo', async () => {
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
    try {
      await spawn('npm', ['install'], {}, { cwd: tempDir })
      const { stdout } = await spawn('node', [bin, '--format', 'repo'], {}, { cwd: tempDir })
      stdout.should.include('https://github.com/Mitsunee/modern-diacritics')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('--format lines', async () => {
    const stub = stubVersions(
      {
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '1.1.0',
      },
      { spawn: true },
    )
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }),
      'utf-8',
    )
    try {
      const { stdout } = await spawn('node', [bin, '--format', 'lines'], {}, { cwd: tempDir })
      stdout.should.equals('ncu-test-v2@^2.0.0\nncu-test-tag@^1.1.0\n')
    } finally {
      removeDir(tempDir)
      stub.restore()
    }
  })

  it('disallow --format lines with --jsonUpgraded', async () => {
    const stub = stubVersions(
      {
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '1.1.0',
      },
      { spawn: true },
    )
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }),
      'utf-8',
    )
    try {
      await spawn(
        'node',
        [bin, '--format', 'lines', '--jsonUpgraded'],
        {},
        {
          cwd: tempDir,
        },
      ).should.eventually.be.rejectedWith('Cannot specify both --format lines and --jsonUpgraded.')
    } finally {
      removeDir(tempDir)
      stub.restore()
    }
  })

  it('disallow --format lines with --jsonAll', async () => {
    const stub = stubVersions(
      {
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '1.1.0',
      },
      { spawn: true },
    )
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }),
      'utf-8',
    )
    try {
      await spawn(
        'node',
        [bin, '--format', 'lines', '--jsonAll'],
        {},
        {
          cwd: tempDir,
        },
      ).should.eventually.be.rejectedWith('Cannot specify both --format lines and --jsonAll.')
    } finally {
      removeDir(tempDir)
      stub.restore()
    }
  })

  it('disallow --format lines with other format options', async () => {
    const stub = stubVersions(
      {
        'ncu-test-v2': '2.0.0',
        'ncu-test-tag': '1.1.0',
      },
      { spawn: true },
    )
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }),
      'utf-8',
    )
    try {
      await spawn(
        'node',
        [bin, '--format', 'lines,group'],
        {},
        {
          cwd: tempDir,
        },
      ).should.eventually.be.rejectedWith('Cannot use --format lines with other formatting options.')
    } finally {
      removeDir(tempDir)
      stub.restore()
    }
  })
})
