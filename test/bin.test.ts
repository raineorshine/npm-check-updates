import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import stripAnsi from 'strip-ansi'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('bin', function () {
  it('accept stdin', () => {
    return spawn('node', [bin, '--stdin'], '{ "dependencies": { "express": "1" } }').then((output: string) => {
      output.trim().should.startWith('express')
    })
  })

  it('reject out-of-date stdin with errorLevel 2', () => {
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

  it('handle no package.json to analyze when receiving empty content on stdin', () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    return spawn('node', [bin], { cwd: os.tmpdir() }).should.eventually.be.rejectedWith('No package.json')
  })

  it('output json with --jsonAll', () => {
    return spawn('node', [bin, '--jsonAll'], '{ "dependencies": { "express": "1" } }')
      .then(JSON.parse)
      .then((pkgData: Record<string, unknown>) => {
        pkgData.should.have.property('dependencies')
        const deps = pkgData.dependencies as Record<string, unknown>
        deps.should.have.property('express')
      })
  })

  it('output only upgraded with --jsonUpgraded', () => {
    return spawn('node', [bin, '--jsonUpgraded'], '{ "dependencies": { "express": "1" } }')
      .then(JSON.parse)
      .then((pkgData: Record<string, unknown>) => {
        pkgData.should.have.property('express')
      })
  })

  it('read --packageFile', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      const text = await spawn('node', [bin, '--jsonUpgraded', '--packageFile', pkgFile])
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
    } finally {
      await fs.unlink(pkgFile)
    }
  })

  it('write to --packageFile', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--packageFile', pkgFile])
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.unlink(pkgFile)
    }
  })

  it('write to --packageFile if errorLevel=2 and upgrades', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

    try {
      const result = await spawn('node', [
        bin,
        '-u',
        '--errorLevel',
        '2',
        '--packageFile',
        pkgFile,
      ]).should.eventually.be.rejectedWith('Dependencies not up-to-date')
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
      return result
    } finally {
      await fs.unlink(pkgFile)
    }
  })

  it('write to --packageFile with jsonUpgraded flag', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--jsonUpgraded', '--packageFile', pkgFile])
      const ugradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      ugradedPkg.should.have.property('dependencies')
      ugradedPkg.dependencies.should.have.property('express')
      ugradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.unlink(pkgFile)
    }
  })

  it('ignore stdin if --packageFile is specified', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--stdin', '--packageFile', pkgFile], '{ "dependencies": {}}')
      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.unlink(pkgFile)
    }
  })

  describe('filter', () => {
    it('filter by package name with --filter', () => {
      return spawn(
        'node',
        [bin, '--jsonUpgraded', '--filter', 'express'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
          pkgData.should.have.property('express')
          pkgData.should.not.have.property('chalk')
        })
    })

    it('filter by package name with -f', () => {
      return spawn(
        'node',
        [bin, '--jsonUpgraded', '-f', 'express'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
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
    it('reject by package name with --reject', () => {
      return spawn(
        'node',
        [bin, '--jsonUpgraded', '--reject', 'chalk'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
          pkgData.should.have.property('express')
          pkgData.should.not.have.property('chalk')
        })
    })

    it('reject by package name with -x', () => {
      return spawn(
        'node',
        [bin, '--jsonUpgraded', '-x', 'chalk'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
          pkgData.should.have.property('express')
          pkgData.should.not.have.property('chalk')
        })
    })
  })

  it('suppress stdout when --silent is provided', () => {
    return spawn('node', [bin, '--silent'], '{ "dependencies": { "express": "1" } }').then((output: string) => {
      output.trim().should.equal('')
    })
  })

  describe('rc-config', () => {
    it('print rcConfigPath when there is a non-empty rc config file', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      await fs.writeFile(tempFilePath + tempFileName, '{"filter": "express"}', 'utf-8')
      try {
        const text = await spawn(
          'node',
          [bin, '--configFilePath', tempFilePath],
          '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
        )
        text.should.include(`Using config file ${path.resolve(tempFilePath, tempFileName)}`)
      } finally {
        await fs.unlink(tempFilePath + tempFileName)
      }
    })

    it('do not print rcConfigPath when there is no rc config file', async () => {
      const text = await spawn('node', [bin], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      text.should.not.include('Using config file')
    })

    it('do not print rcConfigPath when there is an empty rc config file', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      await fs.writeFile(tempFilePath + tempFileName, '{}', 'utf-8')
      try {
        const text = await spawn(
          'node',
          [bin, '--configFilePath', tempFilePath],
          '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
        )
        text.should.not.include('Using config file')
      } finally {
        await fs.unlink(tempFilePath + tempFileName)
      }
    })

    it('read --configFilePath', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      await fs.writeFile(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
      try {
        const text = await spawn(
          'node',
          [bin, '--configFilePath', tempFilePath],
          '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
        )
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      } finally {
        await fs.unlink(tempFilePath + tempFileName)
      }
    })

    it('read --configFileName', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.rctemp.json'
      await fs.writeFile(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
      try {
        const text = await spawn(
          'node',
          [bin, '--configFilePath', tempFilePath, '--configFileName', tempFileName],
          '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
        )
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      } finally {
        await fs.unlink(tempFilePath + tempFileName)
      }
    })

    it('override config with arguments', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      await fs.writeFile(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
      try {
        const text = await spawn(
          'node',
          [bin, '--configFilePath', tempFilePath, '--filter', 'chalk'],
          '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
        )
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('chalk')
        pkgData.should.not.have.property('express')
      } finally {
        await fs.unlink(tempFilePath + tempFileName)
      }
    })

    it('handle boolean arguments', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      // if boolean arguments are not handled as a special case, ncu will incorrectly pass "--deep false" to commander, which will interpret it as two args, i.e. --deep and --filter false
      await fs.writeFile(tempFilePath + tempFileName, '{"jsonUpgraded": true, "deep": false }', 'utf-8')
      try {
        const text = await spawn(
          'node',
          [bin, '--configFilePath', tempFilePath],
          '{ "dependencies": { "chalk": "0.1.0" } }',
        )
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('chalk')
      } finally {
        await fs.unlink(tempFilePath + tempFileName)
      }
    })
  })

  describe('with timeout option', () => {
    it('exit with error when timeout exceeded', () => {
      return spawn(
        'node',
        [bin, '--timeout', '1'],
        '{ "dependencies": { "express": "1" } }',
      ).should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
    })

    it('completes successfully with timeout', () => {
      return spawn('node', [bin, '--timeout', '100000'], '{ "dependencies": { "express": "1" } }')
    })
  })

  describe('embedded versions', () => {
    it('strip url from Github url in "to" output', async () => {
      const dependencies = {
        'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2.git#v1.0.0',
      }
      const output = await spawn('node', [bin, '--stdin'], JSON.stringify({ dependencies }))
      stripAnsi(output)
        .trim()
        .should.equal('ncu-test-v2  https://github.com/raineorshine/ncu-test-v2.git#v1.0.0  →  v2.0.0')
    })

    it('strip prefix from npm alias in "to" output', async () => {
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

  // TODO: Hangs on Windows
  // it('global should run', async () => {
  //   this.timeout(3 * 60 * 1000)
  //   await spawn('node', [bin, '--global'])
  // })
})
