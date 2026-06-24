import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { format as timeAgoFormat } from 'timeago.js'
import removeDir from './helpers/removeDir'
import { runNcuCli } from './helpers/runNcuCli'
import stubVersions from './helpers/stubVersions'

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
      const { stdout } = await runNcuCli(
        // -u was added to avoid accidentally matching dev, peer, optional from "Run ncu --dep prod,dev,peer,optional --format dep -u to upgrade package.json"
        ['--dep', 'prod,dev,peer,optional', '--format', 'dep', '-u'],
        { cwd: tempDir },
      )

      stdout.should.include('dev')
      stdout.should.include('peer')
      stdout.should.include('optional')
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
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
      const stub = stubVersions('2.0.0', { spawn: true })
      try {
        const { stdout } = await runNcuCli(['--format', 'diff'], { cwd: tempDir })
        stdout.should.include('https://npmdiff.dev/ncu-test-v2/1.0.0/2.0.0')
      } finally {
        await removeDir(tempDir)
        stub.mockRestore()
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
      const stub = stubVersions('1.1.0', { spawn: true })
      try {
        const { stdout } = await runNcuCli(['--format', 'diff'], { cwd: tempDir })
        // purposefully omit 'to' version since this is a live package
        stdout.should.include('https://npmdiff.dev/%40types%2Fjsonlines/0.1.0/')
      } finally {
        await removeDir(tempDir)
        stub.mockRestore()
      }
    })
  })

  // do not stubVersions here, because we need to test if time is parsed correctly from npm-registry-fetch
  it('--format time', async () => {
    const timestamp = '2020-04-27T21:48:11.660Z'
    const stub = stubVersions({
      name: 'ncu-test-v2',
      version: '2.0.0',
      time: {
        '2.0.0': timestamp,
      },
    })
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
      },
    }
    const { stdout } = await runNcuCli(['--format', 'time', '--stdin'], {
      stdin: JSON.stringify(packageData),
    })
    const expectedString = timeAgoFormat(timestamp, 'en_US')
    expect(stdout).contains(expectedString)
    stub.mockRestore()
  })

  it('--format repo', async () => {
    const stub = stubVersions({ 'modern-diacritics': '2.3.1' })
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
      const { stdout } = await runNcuCli(['--format', 'repo'], { cwd: tempDir })
      stdout.should.include('https://github.com/Mitsunee/modern-diacritics')
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
    }
  })

  it('--format homepage', async () => {
    const stub = stubVersions({ 'hosted-git-info': '10.1.1' })
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
    const modernDiacriticsPath = path.join(tempDir, 'node_modules', 'hosted-git-info')
    await fs.mkdir(modernDiacriticsPath, { recursive: true })
    const modernDiacriticsPkgFile = path.join(modernDiacriticsPath, 'package.json')
    await fs.writeFile(
      modernDiacriticsPkgFile,
      JSON.stringify({ homepage: 'https://github.com/npm/hosted-git-info' }),
      'utf-8',
    )
    try {
      const { stdout } = await runNcuCli(['--format', 'homepage'], { cwd: tempDir })
      stdout.should.include('https://github.com/npm/hosted-git-info')
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
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
      const { stdout } = await runNcuCli(['--format', 'lines'], { cwd: tempDir })
      stdout.should.equals('ncu-test-v2@^2.0.0\nncu-test-tag@^1.1.0\n')
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
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
      await runNcuCli(['--format', 'lines', '--jsonUpgraded'], { cwd: tempDir }).should.eventually.be.rejectedWith(
        'Cannot specify both --format lines and --jsonUpgraded.',
      )
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
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
      await runNcuCli(['--format', 'lines', '--jsonAll'], { cwd: tempDir }).should.eventually.be.rejectedWith(
        'Cannot specify both --format lines and --jsonAll.',
      )
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
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
      await runNcuCli(['--format', 'lines,group'], { cwd: tempDir }).should.eventually.be.rejectedWith(
        'Cannot use --format lines with other formatting options.',
      )
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
    }
  })
})
