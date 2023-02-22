import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('bin', async function () {
  it('runs from the command line', async () => {
    await spawn('node', [bin], '{}')
  })

  it('output only upgraded with --jsonUpgraded', async () => {
    const output = await spawn('node', [bin, '--jsonUpgraded', '--stdin'], '{ "dependencies": { "express": "1" } }')
    const pkgData = JSON.parse(output) as Record<string, unknown>
    pkgData.should.have.property('express')
  })

  it('--loglevel verbose', async () => {
    const output = await spawn('node', [bin, '--loglevel', 'verbose'], '{ "dependencies": { "ncu-test-v2": "1.0.0" } }')
    output.should.containIgnoreCase('Initializing')
    output.should.containIgnoreCase('Running in local mode')
    output.should.containIgnoreCase('Finding package file data')
  })

  it('--verbose', async () => {
    const output = await spawn('node', [bin, '--verbose'], '{ "dependencies": { "ncu-test-v2": "1.0.0" } }')
    output.should.containIgnoreCase('Initializing')
    output.should.containIgnoreCase('Running in local mode')
    output.should.containIgnoreCase('Finding package file data')
  })

  it('accept stdin', async () => {
    const output = await spawn('node', [bin, '--stdin'], '{ "dependencies": { "express": "1" } }')
    output.trim().should.startWith('express')
  })

  it('reject out-of-date stdin with errorLevel 2', async () => {
    return spawn(
      'node',
      [bin, '--stdin', '--errorLevel', '2'],
      '{ "dependencies": { "express": "1" } }',
    ).should.eventually.be.rejectedWith('Dependencies not up-to-date')
  })

  it('fall back to package.json search when receiving empty content on stdin', async () => {
    const stdout = await spawn('node', [bin, '--stdin'])
    stdout
      .toString()
      .trim()
      .should.match(/^Checking .+package.json/)
  })

  it('use package.json in cwd by default', async () => {
    const output = await spawn('node', [bin, '--jsonUpgraded'], { cwd: path.join(__dirname, 'test-data/ncu') })
    const pkgData = JSON.parse(output)
    pkgData.should.have.property('express')
  })

  it('throw error if there is no package', async () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    return spawn('node', [bin], { cwd: os.tmpdir() }).should.eventually.be.rejectedWith('No package.json')
  })

  it('throw error if there is no package in --cwd', async () => {
    return spawn('node', [bin, '--cwd', os.tmpdir()]).should.eventually.be.rejectedWith('No package.json')
  })

  it('throw error if --cwd does not exist', async () => {
    return spawn('node', [bin, '--cwd', 'fnuoathufoawhtufonwauto']).should.eventually.be.rejectedWith(
      'no such directory: fnuoathufoawhtufonwauto',
    )
  })

  it('read --packageFile', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      const text = await spawn('node', [bin, '--jsonUpgraded', '--packageFile', pkgFile])
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('write to --packageFile', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--packageFile', pkgFile])
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('write to --packageFile if errorLevel=2 and upgrades', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

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
    }
  })

  it('write to --packageFile with jsonUpgraded flag', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--jsonUpgraded', '--packageFile', pkgFile])
      const ugradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      ugradedPkg.should.have.property('dependencies')
      ugradedPkg.dependencies.should.have.property('express')
      ugradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('ignore stdin if --packageFile is specified', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--stdin', '--packageFile', pkgFile], '{ "dependencies": {}}')
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('suppress stdout when --silent is provided', async () => {
    const output = await spawn('node', [bin, '--silent'], '{ "dependencies": { "express": "1" } }')
    output.trim().should.equal('')
  })

  it('quote arguments with spaces in upgrade hint', async () => {
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
      const output = await spawn('node', [bin, '--packageFile', pkgFile, '--filter', 'ncu-test-v2 ncu-test-tag'])
      output.should.include('"ncu-test-v2 ncu-test-tag"')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('embedded versions', () => {
  it('strip url from Github url in "to" output', async () => {
    // use dynamic import for ESM module
    const { default: stripAnsi } = await import('strip-ansi')
    const dependencies = {
      'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2.git#v1.0.0',
    }
    const output = await spawn('node', [bin, '--stdin'], JSON.stringify({ dependencies }))
    stripAnsi(output)
      .trim()
      .should.equal('ncu-test-v2  https://github.com/raineorshine/ncu-test-v2.git#v1.0.0  →  v2.0.0')
  })

  it('strip prefix from npm alias in "to" output', async () => {
    // use dynamic import for ESM module
    const { default: stripAnsi } = await import('strip-ansi')
    const dependencies = {
      request: 'npm:ncu-test-v2@1.0.0',
    }
    const output = await spawn('node', [bin, '--stdin'], JSON.stringify({ dependencies }))
    stripAnsi(output).trim().should.equal('request  npm:ncu-test-v2@1.0.0  →  2.0.0')
  })
})

describe('option-specific help', () => {
  it('long option', async () => {
    const output = await spawn('node', [bin, '--help', '--filter'])
    output.trim().should.match(/^Usage:\s+ncu --filter/)
  })

  it('long option without "--" prefix', async () => {
    const output = await spawn('node', [bin, '--help', '-f'])
    output.trim().should.match(/^Usage:\s+ncu --filter/)
  })

  it('short option', async () => {
    const output = await spawn('node', [bin, '--help', 'filter'])
    output.trim().should.match(/^Usage:\s+ncu --filter/)
  })

  it('short option without "-" prefix', async () => {
    const output = await spawn('node', [bin, '--help', 'f'])
    output.trim().should.match(/^Usage:\s+ncu --filter/)
  })

  it('option with default', async () => {
    const output = await spawn('node', [bin, '--help', '--concurrency'])
    output.trim().should.containIgnoreCase('Default:')
  })

  it('option with extended help', async () => {
    const output = await spawn('node', [bin, '--help', '--target'])
    output.trim().should.containIgnoreCase('Upgrade to the highest version number')

    // run extended help on other options for test coverage
    await spawn('node', [bin, '--help', 'doctor'])
    await spawn('node', [bin, '--help', 'format'])
    await spawn('node', [bin, '--help', 'group'])
    await spawn('node', [bin, '--help', 'packageManager'])
    await spawn('node', [bin, '--help', 'peer'])
  })

  it('unknown option', async () => {
    const output = await spawn('node', [bin, '--help', '--foo'])
    output.trim().should.containIgnoreCase('Unknown option')
  })

  it('special --help --help', async () => {
    const output = await spawn('node', [bin, '--help', '--help'])
    output.trim().should.not.include('Usage')
  })

  it('ignore file: and link: protocols', async () => {
    const { default: stripAnsi } = await import('strip-ansi')
    const dependencies = {
      editor: 'file:../editor',
      event: 'link:../link',
    }
    const output = await spawn('node', [bin, '--stdin'], JSON.stringify({ dependencies }))

    stripAnsi(output)!.should.not.include(
      'No package versions were returned. This is likely a problem with your installed npm',
    )
  })
})
