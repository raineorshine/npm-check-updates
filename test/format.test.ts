import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path, { dirname } from 'path'
import spawn from 'spawn-please'
import { fileURLToPath } from 'url'
import chaiSetup from './helpers/chaiSetup'
import removeDir from './helpers/removeDir'
import stubVersions from './helpers/stubVersions'

chaiSetup()
const __dirname = dirname(fileURLToPath(import.meta.url))

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
      await removeDir(tempDir)
      stub.restore()
    }
  })

  describe('diff', () => {
    it('basic', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        pkgFile,
        JSON.stringify({
          dependencies: {
            'ncu-test-v2': '^1.0.0',
          },
        }),
        'utf-8',
      )
      try {
        const { stdout } = await spawn('node', [bin, '--format', 'diff'], {}, { cwd: tempDir })
        stdout.should.include('https://npmdiff.dev/ncu-test-v2/1.0.0/2.0.0')
      } finally {
        await removeDir(tempDir)
      }
    })

    // https://github.com/raineorshine/npm-check-updates/pull/1603/changes/BASE..4ab36b01b5f90e8d2563361a3b18ed2b3f9d2280#r2865386584
    it('encodeURIComponent', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        pkgFile,
        JSON.stringify({
          dependencies: {
            '@types/jsonlines': '0.1.0',
          },
        }),
        'utf-8',
      )
      try {
        const { stdout } = await spawn('node', [bin, '--format', 'diff'], {}, { cwd: tempDir })
        // purposefully omit 'to' version since this is a live package
        stdout.should.include('https://npmdiff.dev/%40types%2Fjsonlines/0.1.0/')
      } finally {
        await removeDir(tempDir)
      }
    })
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
      await removeDir(tempDir)
    }
  })

  it('--format homepage', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: {
          'hosted-git-info': '^5.0.0',
        },
      }),
      'utf-8',
    )
    try {
      await spawn('npm', ['install'], {}, { cwd: tempDir })
      const { stdout } = await spawn('node', [bin, '--format', 'homepage'], {}, { cwd: tempDir })
      stdout.should.include('https://github.com/npm/hosted-git-info')
    } finally {
      await removeDir(tempDir)
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
      await removeDir(tempDir)
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
      await removeDir(tempDir)
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
      await removeDir(tempDir)
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
      await removeDir(tempDir)
      stub.restore()
    }
  })
})
