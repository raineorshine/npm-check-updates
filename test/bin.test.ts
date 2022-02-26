import fs from 'fs'
import os from 'os'
import path from 'path'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import spawn from 'spawn-please'
import stripAnsi from 'strip-ansi'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('bin', function () {

  let last = 0

  /** Gets the temp package file path. */
  function getTempFile() {
    return `test/temp_package${++last}.json`
  }

  it('accept stdin', () => {
    return spawn('node', [bin], '{ "dependencies": { "express": "1" } }')
      .then((output: string) => {
        output.trim().should.startWith('express')
      })
  })

  it('reject out-of-date stdin with errorLevel 2', () => {
    return spawn('node', [bin, '--errorLevel', '2'], '{ "dependencies": { "express": "1" } }')
      .should.eventually.be.rejectedWith('Dependencies not up-to-date')
  })

  it('fall back to package.json search when receiving empty content on stdin', async () => {
    const stdout = await spawn('node', [bin])
    stdout.toString().trim().should.match(/^Checking .+package.json/)
  })

  it('use package.json in cwd by default', async () => {
    const output = await spawn('node', [bin, '--jsonUpgraded'], { cwd: path.join(__dirname, 'ncu') })
    const pkgData = JSON.parse(output)
    pkgData.should.have.property('express')
  })

  it('handle no package.json to analyze when receiving empty content on stdin', () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    return spawn('node', [bin], { cwd: os.tmpdir() })
      .should.eventually.be.rejectedWith('No package.json')
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
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      const text = await spawn('node', [bin, '--jsonUpgraded', '--packageFile', tempFile])
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('write to --packageFile', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--packageFile', tempFile])
      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('write to --packageFile if errorLevel=2 and upgrades', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

    try {
      const result = await spawn('node', [bin, '-u', '--errorLevel', '2', '--packageFile', tempFile])
        .should.eventually.be.rejectedWith('Dependencies not up-to-date')
      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
      return result
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('write to --packageFile with jsonUpgraded flag', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--jsonUpgraded', '--packageFile', tempFile])
      const ugradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      ugradedPkg.should.have.property('dependencies')
      ugradedPkg.dependencies.should.have.property('express')
      ugradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('ignore stdin if --packageFile is specified', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', [bin, '-u', '--packageFile', tempFile], '{ "dependencies": {}}')
      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  describe('filter', () => {

    it('filter by package name with --filter', () => {
      return spawn('node', [bin, '--jsonUpgraded', '--filter', 'express'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
          pkgData.should.have.property('express')
          pkgData.should.not.have.property('chalk')
        })
    })

    it('filter by package name with -f', () => {
      return spawn('node', [bin, '--jsonUpgraded', '-f', 'express'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
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
        }
      }

      await spawn('node', [bin, '--jsonUpgraded', '--filter', 'lodash.map', 'lodash.filter'], JSON.stringify(pkgData))
        .should.eventually.be.rejected

    })

    it('allow matching --filter and arguments', async () => {

      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        }
      }

      const output = await spawn('node', [bin, '--jsonUpgraded', '--filter', 'lodash.map lodash.filter', 'lodash.map', 'lodash.filter'], JSON.stringify(pkgData))
      const upgraded = JSON.parse(output)
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')

    })

  })

  describe('reject', () => {

    it('reject by package name with --reject', () => {
      return spawn('node', [bin, '--jsonUpgraded', '--reject', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
          pkgData.should.have.property('express')
          pkgData.should.not.have.property('chalk')
        })
    })

    it('reject by package name with -x', () => {
      return spawn('node', [bin, '--jsonUpgraded', '-x', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        .then(JSON.parse)
        .then((pkgData: Record<string, unknown>) => {
          pkgData.should.have.property('express')
          pkgData.should.not.have.property('chalk')
        })
    })

  })

  it('suppress stdout when --silent is provided', () => {
    return spawn('node', [bin, '--silent'], '{ "dependencies": { "express": "1" } }')
      .then((output: string) => {
        output.trim().should.equal('')
      })
  })

  describe('rc-config', () => {

    it('print rcConfigPath when there is a non-empty rc config file', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      fs.writeFileSync(tempFilePath + tempFileName, '{"filter": "express"}', 'utf-8')
      try {
        const text = await spawn('node', [bin, '--configFilePath', tempFilePath], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        text.should.include(`Using config file ${path.resolve(tempFilePath, tempFileName)}`)
      }
      finally {
        fs.unlinkSync(tempFilePath + tempFileName)
      }
    })

    it('do not print rcConfigPath when there is no rc config file', async () => {
      const text = await spawn('node', [bin], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      text.should.not.include('Using config file')
    })

    it('do not print rcConfigPath when there is an empty rc config file', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      fs.writeFileSync(tempFilePath + tempFileName, '{}', 'utf-8')
      try {
        const text = await spawn('node', [bin, '--configFilePath', tempFilePath], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        text.should.not.include('Using config file')
      }
      finally {
        fs.unlinkSync(tempFilePath + tempFileName)
      }
    })

    it('read --configFilePath', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
      try {
        const text = await spawn('node', [bin, '--configFilePath', tempFilePath], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      }
      finally {
        fs.unlinkSync(tempFilePath + tempFileName)
      }
    })

    it('read --configFileName', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.rctemp.json'
      fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
      try {
        const text = await spawn('node', [bin, '--configFilePath', tempFilePath, '--configFileName', tempFileName], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      }
      finally {
        fs.unlinkSync(tempFilePath + tempFileName)
      }
    })

    it('override config with arguments', async () => {
      const tempFilePath = './test/'
      const tempFileName = '.ncurc.json'
      fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
      try {
        const text = await spawn('node', [bin, '--configFilePath', tempFilePath, '--filter', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
        const pkgData = JSON.parse(text)
        pkgData.should.have.property('chalk')
        pkgData.should.not.have.property('express')
      }
      finally {
        fs.unlinkSync(tempFilePath + tempFileName)
      }
    })

  })

  describe('with timeout option', () => {

    it('exit with error when timeout exceeded', () => {
      return spawn('node', [bin, '--timeout', '1'], '{ "dependencies": { "express": "1" } }')
        .should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
    })

    it('completes successfully with timeout', () => {
      return spawn('node', [bin, '--timeout', '100000'], '{ "dependencies": { "express": "1" } }')
    })
  })

  describe('embedded versions', () => {

    it('strip url from Github url in "to" output', async () => {
      const dependencies = {
        'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2.git#v1.0.0'
      }
      const output = await spawn('node', [bin], JSON.stringify({ dependencies }))
      stripAnsi(output).trim().should.equal('ncu-test-v2  https://github.com/raineorshine/ncu-test-v2.git#v1.0.0  →  v2.0.0')
    })

    it('strip prefix from npm alias in "to" output', async () => {
      const dependencies = {
        request: 'npm:ncu-test-v2@1.0.0'
      }
      const output = await spawn('node', [bin], JSON.stringify({ dependencies }))
      stripAnsi(output).trim().should.equal('request  npm:ncu-test-v2@1.0.0  →  2.0.0')
    })

  })

  describe('option-specific help', () => {

    it('regular option', async () => {
      const output = await spawn('node', [bin, '--help', '--filter'])
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
