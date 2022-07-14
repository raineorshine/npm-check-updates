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
    const output = await spawn('node', [bin, '--jsonUpgraded'], { cwd: path.join(__dirname, 'ncu') })
    const pkgData = JSON.parse(output)
    pkgData.should.have.property('express')
  })

  it('handle no package.json to analyze when receiving empty content on stdin', async () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    return spawn('node', [bin], { cwd: os.tmpdir() }).should.eventually.be.rejectedWith('No package.json')
  })

  it('output json with --jsonAll', async () => {
    const output = await spawn('node', [bin, '--jsonAll'], '{ "dependencies": { "express": "1" } }')
    const pkgData = JSON.parse(output) as Record<string, unknown>
    pkgData.should.have.property('dependencies')
    const deps = pkgData.dependencies as Record<string, unknown>
    deps.should.have.property('express')
  })

  it('output only upgraded with --jsonUpgraded', async () => {
    const output = await spawn('node', [bin, '--jsonUpgraded'], '{ "dependencies": { "express": "1" } }')
    const pkgData = JSON.parse(output) as Record<string, unknown>
    pkgData.should.have.property('express')
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

  describe('filter', () => {
    it('filter by package name with --filter', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--filter', 'express'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    })

    it('filter by package name with -f', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '-f', 'express'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    })
  })

  it('do not allow non-matching --filter and arguments', async () => {
    const pkgData = {
      dependencies: {
        'lodash.map': '2.0.0',
        'lodash.filter': '2.0.0',
      },
    }

    await spawn('node', [bin, '--jsonUpgraded', '--filter', 'lodash.map', 'lodash.filter'], JSON.stringify(pkgData))
      .should.eventually.be.rejected
  })

  it('allow matching --filter and arguments', async () => {
    const pkgData = {
      dependencies: {
        'lodash.map': '2.0.0',
        'lodash.filter': '2.0.0',
      },
    }

    const output = await spawn(
      'node',
      [bin, '--jsonUpgraded', '--filter', 'lodash.map lodash.filter', 'lodash.map', 'lodash.filter'],
      JSON.stringify(pkgData),
    )
    const upgraded = JSON.parse(output)
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
  })
})

describe('reject', () => {
  it('reject by package name with --reject', async () => {
    const output = await spawn(
      'node',
      [bin, '--jsonUpgraded', '--reject', 'chalk'],
      '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
    )
    const pkgData = JSON.parse(output)
    pkgData.should.have.property('express')
    pkgData.should.not.have.property('chalk')
  })
})

it('reject by package name with -x', async () => {
  const output = await spawn(
    'node',
    [bin, '--jsonUpgraded', '-x', 'chalk'],
    '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
  )
  const pkgData = JSON.parse(output)
  pkgData.should.have.property('express')
  pkgData.should.not.have.property('chalk')
})

it('suppress stdout when --silent is provided', async () => {
  const output = await spawn('node', [bin, '--silent'], '{ "dependencies": { "express": "1" } }')
  output.trim().should.equal('')
})

describe('rc-config', () => {
  it('print rcConfigPath when there is a non-empty rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{"filter": "express"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      text.should.include(`Using config file ${tempConfigFile}`)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('do not print rcConfigPath when there is no rc config file', async () => {
    const text = await spawn('node', [bin], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
    text.should.not.include('Using config file')
  })

  it('do not print rcConfigPath when there is an empty rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      text.should.not.include('Using config file')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('read --configFilePath', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('read --configFileName', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFileName = '.rctemp.json'
    const tempConfigFile = path.join(tempDir, tempConfigFileName)
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir, '--configFileName', tempConfigFileName],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('override config with arguments', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir, '--filter', 'chalk'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('chalk')
      pkgData.should.not.have.property('express')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('handle boolean arguments', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    // if boolean arguments are not handled as a special case, ncu will incorrectly pass "--deep false" to commander, which will interpret it as two args, i.e. --deep and --filter false
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "deep": false }', 'utf-8')
    try {
      const text = await spawn('node', [bin, '--configFilePath', tempDir], '{ "dependencies": { "chalk": "0.1.0" } }')
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('chalk')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  describe('with timeout option', () => {
    it('exit with error when timeout exceeded', async () => {
      return spawn(
        'node',
        [bin, '--timeout', '1'],
        '{ "dependencies": { "express": "1" } }',
      ).should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
    })

    it('completes successfully with timeout', async () => {
      return spawn('node', [bin, '--timeout', '100000'], '{ "dependencies": { "express": "1" } }')
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
      output.trim().should.startWith('Usage: ncu --filter')
    })

    it('long option without "--" prefix', async () => {
      const output = await spawn('node', [bin, '--help', '-f'])
      output.trim().should.startWith('Usage: ncu --filter')
    })

    it('short option', async () => {
      const output = await spawn('node', [bin, '--help', 'filter'])
      output.trim().should.startWith('Usage: ncu --filter')
    })

    it('short option without "-" prefix', async () => {
      const output = await spawn('node', [bin, '--help', 'f'])
      output.trim().should.startWith('Usage: ncu --filter')
    })

    it('option with default', async () => {
      const output = await spawn('node', [bin, '--help', '--concurrency'])
      output.trim().should.include('Default:')
    })

    it('option with extended help', async () => {
      const output = await spawn('node', [bin, '--help', '--target'])
      output.trim().should.include('Upgrade to the highest version number')

      // run extended help on other options for test coverage
      await spawn('node', [bin, '--help', 'doctor'])
      await spawn('node', [bin, '--help', 'format'])
      await spawn('node', [bin, '--help', 'group'])
      await spawn('node', [bin, '--help', 'packageManager'])
      await spawn('node', [bin, '--help', 'peer'])
    })

    it('unknown option', async () => {
      const output = await spawn('node', [bin, '--help', '--foo'])
      output.trim().should.include('Unknown option')
    })

    it('special --help --help', async () => {
      const output = await spawn('node', [bin, '--help', '--help'])
      output.trim().should.not.include('Usage')
    })
  })
})
