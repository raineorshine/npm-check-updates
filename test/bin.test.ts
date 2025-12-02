import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import { Index } from '../src/types/IndexType'
import { Version } from '../src/types/Version'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')

describe('bin', async function () {
  it('fetch latest version from registry (not stubbed)', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    const pkgData = JSON.parse(stdout)
    pkgData.should.have.property('ncu-test-v2')
  })

  it('output only upgraded with --jsonUpgraded', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    const pkgData = JSON.parse(stdout)
    pkgData.should.have.property('ncu-test-v2')
    stub.restore()
  })

  it('--loglevel verbose', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--loglevel', 'verbose'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    stdout.should.containIgnoreCase('Initializing')
    stdout.should.containIgnoreCase('Running in local mode')
    stdout.should.containIgnoreCase('Finding package file data')
    stub.restore()
  })

  it('--verbose', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--verbose'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
    })
    stdout.should.containIgnoreCase('Initializing')
    stdout.should.containIgnoreCase('Running in local mode')
    stdout.should.containIgnoreCase('Finding package file data')
    stub.restore()
  })

  it('accept stdin', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin'], {
      stdin: JSON.stringify({ dependencies: { express: '1' } }),
    })
    stdout.trim().should.startWith('express')
    stub.restore()
  })

  it('reject out-of-date stdin with errorLevel 2', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    await spawn('node', [bin, '--stdin', '--errorLevel', '2'], {
      stdin: JSON.stringify({ dependencies: { express: '1' } }),
    }).should.eventually.be.rejectedWith('Dependencies not up-to-date')
    stub.restore()
  })

  it('fall back to package.json search when receiving empty content on stdin', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin'])
    stdout
      .toString()
      .trim()
      .should.match(/^Checking .+package.json/)
    stub.restore()
  })

  it('use package.json in cwd by default', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded'], {}, { cwd: path.join(__dirname, 'test-data/ncu') })
    const pkgData = JSON.parse(stdout)
    pkgData.should.have.property('express')
    stub.restore()
  })

  it('throw error if there is no package', async () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    return spawn('node', [bin], {}, { cwd: os.tmpdir() }).should.eventually.be.rejectedWith('No package.json')
  })

  it('throw error if there is no package in --cwd', async () => {
    return spawn('node', [bin, '--cwd', os.tmpdir()]).should.eventually.be.rejectedWith('No package.json')
  })

  it('throw error if --cwd does not exist', async () => {
    return spawn('node', [bin, '--cwd', 'fnuoathufoawhtufonwauto']).should.eventually.be.rejectedWith(
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
      pkgData.should.have.property('express')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
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
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('write to --packageFile if errorLevel=2 and upgrades', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { express: '1' } }), 'utf-8')

    try {
      await spawn('node', [bin, '-u', '--errorLevel', '2', '--packageFile', pkgFile]).should.eventually.be.rejectedWith(
        'Dependencies not up-to-date',
      )
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
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
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
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
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('suppress stdout when --silent is provided', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--silent'], {
      stdin: JSON.stringify({ dependencies: { express: '1' } }),
    })
    stdout.trim().should.equal('')
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
      stdout.should.include('"ncu-test-v2 ncu-test-tag"')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('ignore file: and link: protocols', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { default: stripAnsi } = await import('strip-ansi')
    const dependencies = {
      editor: 'file:../editor',
      event: 'link:../link',
      workspace: 'workspace:../workspace',
    }
    const { stdout } = await spawn('node', [bin, '--stdin'], { stdin: JSON.stringify({ dependencies }) })

    stripAnsi(stdout)!.should.not.include('No package versions were returned.')
    stub.restore()
  })

  it('combine boolean flags with arguments', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const { stdout } = await spawn('node', [bin, '--stdin', '--jsonUpgraded', 'ncu-test-v2'], {
      stdin: JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '0.1.0' } }),
    })
    const upgraded = JSON.parse(stdout) as Index<Version>
    upgraded.should.deep.equal({
      'ncu-test-v2': '99.9.9',
    })
    stub.restore()
  })

  it('combine short boolean options with long options', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    const promise = spawn('node', [bin, '-mp', 'foo'])
    await promise.should.eventually.be.rejectedWith('Invalid package manager: foo')
    stub.restore()
  })

  describe('embedded versions', () => {
    it('strip url from GitHub url in "to" output', async () => {
      // use dynamic import for ESM module
      const { default: stripAnsi } = await import('strip-ansi')
      const dependencies = {
        'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2.git#v1.0.0',
      }
      const { stdout } = await spawn('node', [bin, '--stdin'], { stdin: JSON.stringify({ dependencies }) })
      stripAnsi(stdout)
        .trim()
        .should.equal('ncu-test-v2  https://github.com/raineorshine/ncu-test-v2.git#v1.0.0  →  v2.0.0')
    })

    it('strip prefix from npm alias in "to" output', async () => {
      const stub = stubVersions('99.9.9', { spawn: true })
      // use dynamic import for ESM module
      const { default: stripAnsi } = await import('strip-ansi')
      const dependencies = {
        request: 'npm:ncu-test-v2@1.0.0',
      }
      const { stdout } = await spawn('node', [bin, '--stdin'], { stdin: JSON.stringify({ dependencies }) })
      stripAnsi(stdout).trim().should.equal('request  npm:ncu-test-v2@1.0.0  →  99.9.9')
      stub.restore()
    })
  })

  describe('option-specific help', () => {
    it('long option', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--filter'])
      stdout.trim().should.match(/^Usage:\s+ncu --filter/)
    })

    it('long option without "--" prefix', async () => {
      const { stdout } = await spawn('node', [bin, '--help', 'filter'])
      stdout.trim().should.match(/^Usage:\s+ncu --filter/)
    })

    it('short option', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '-f'])
      stdout.trim().should.match(/^Usage:\s+ncu --filter/)
    })

    it('short option without "-" prefix', async () => {
      const { stdout } = await spawn('node', [bin, '--help', 'f'])
      stdout.trim().should.match(/^Usage:\s+ncu --filter/)
    })

    it('option with default', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--concurrency'])
      stdout.trim().should.containIgnoreCase('Default:')
    })

    it('option with extended help', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--target'])
      stdout.trim().should.containIgnoreCase('Upgrade to the highest version number')
    })

    it('-h', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--filter'])
      stdout.trim().should.match(/^Usage:\s+ncu --filter/)
    })

    it('unknown option', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--foo'])
      stdout.trim().should.containIgnoreCase('Unknown option')
    })

    it('multiple options', async () => {
      const { stdout } = await spawn('node', [bin, '--help', '--interactive', '--minimal'])
      stdout.trim().should.containIgnoreCase('ncu --interactive')
      stdout.trim().should.containIgnoreCase('ncu --minimal')
    })

    // version is a special case since it is not included in cli-options.ts
    it('--version', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--version'])
      stdout.trim().should.match(/^Usage:\s+ncu --version/)
    })

    it('-V', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--version'])
      stdout.trim().should.match(/^Usage:\s+ncu --version/)
    })

    it('-v', async () => {
      const { stdout } = await spawn('node', [bin, '-h', '--version'])
      stdout.trim().should.match(/^Usage:\s+ncu --version/)
    })

    describe('special --help help', () => {
      it('--help --help', async () => {
        const { stdout } = await spawn('node', [bin, '--help', '--help'])
        stdout.trim().should.not.include('Usage')
      })

      it('--help help', async () => {
        const { stdout } = await spawn('node', [bin, '--help', 'help'])
        stdout.trim().should.not.include('Usage')
      })

      it('--help -h', async () => {
        const { stdout } = await spawn('node', [bin, '--help', '-h'])
        stdout.trim().should.not.include('Usage')
      })

      it('--help h', async () => {
        const { stdout } = await spawn('node', [bin, '--help', 'h'])
        stdout.trim().should.not.include('Usage')
      })

      it('-h --help', async () => {
        const { stdout } = await spawn('node', [bin, '-h', '--help'])
        stdout.trim().should.not.include('Usage')
      })

      it('-h help', async () => {
        const { stdout } = await spawn('node', [bin, '-h', 'help'])
        stdout.trim().should.not.include('Usage')
      })

      it('-h -h', async () => {
        const { stdout } = await spawn('node', [bin, '-h', '-h'])
        stdout.trim().should.not.include('Usage')
      })

      it('-h h', async () => {
        const { stdout } = await spawn('node', [bin, '-h', 'h'])
        stdout.trim().should.not.include('Usage')
      })
    })
  })
})
