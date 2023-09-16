import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'
import stubNpmView from './helpers/stubNpmView'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('format', () => {
  it('--format time', async () => {
    const timestamp = '2020-04-27T21:48:11.660Z'
    const stub = stubNpmView(
      {
        version: '99.9.9',
        time: {
          '99.9.9': timestamp,
        },
      },
      { spawn: true },
    )
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
      },
    }
    const output = await spawn('node', [bin, '--format', 'time', '--stdin'], JSON.stringify(packageData))
    expect(output).contains(timestamp)
    stub.restore()
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
      await spawn('npm', ['install'], { cwd: tempDir })
      const output = await spawn('node', [bin, '--format', 'repo'], { cwd: tempDir })
      output.should.include('https://github.com/Mitsunee/modern-diacritics')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('--format lines', async () => {
    const stub = stubNpmView(
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
      await spawn('npm', ['install'], { cwd: tempDir })
      const output = await spawn('node', [bin, '--format', 'lines'], { cwd: tempDir })
      output.should.equals('ncu-test-v2@^2.0.0\nncu-test-tag@^1.1.0\n')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
      stub.restore()
    }
  })
})
