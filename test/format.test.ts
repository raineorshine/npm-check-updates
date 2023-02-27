import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

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
})
