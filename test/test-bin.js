'use strict'

const fs = require('fs')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const chaiString = require('chai-string')
const spawn = require('spawn-please')
const tmp = require('tmp')

chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = true

describe('bin', function () {

  this.timeout(30000)

  let last = 0
  function getTempFile() {
    return `test/temp_package${++last}.json`
  }

  it('should accept stdin', () => {
    return spawn('node', ['bin/ncu.js'], '{ "dependencies": { "express": "1" } }')
      .then(output => {
        output.trim().should.startWith('express')
      })
  })

  it('should reject out-of-date stdin with errorLevel 2', () => {
    return spawn('node', ['bin/ncu.js', '--errorLevel', '2'], '{ "dependencies": { "express": "1" } }')
      .should.eventually.be.rejectedWith('Dependencies not up-to-date')
  })

  it('should fall back to package.json search when receiving empty content on stdin', () => {
    return spawn('node', ['bin/ncu.js']).then(stdout => {
      stdout.toString().trim().should.match(/^Checking .+package.json/)
    })
  })

  it('should handle no package.json to analyze when receiving empty content on stdin', () => {
    // run from tmp dir to avoid ncu analyzing the project's package.json
    return spawn('node', [`${process.cwd()}/bin/ncu.js`], { cwd: tmp.dirSync().name })
      .should.eventually.be.rejectedWith('No package.json')
  })

  it('should output json with --jsonAll', () => {
    return spawn('node', ['bin/ncu.js', '--jsonAll'], '{ "dependencies": { "express": "1" } }')
      .then(JSON.parse)
      .then(pkgData => {
        pkgData.should.have.property('dependencies')
        pkgData.dependencies.should.have.property('express')
      })
  })

  it('should output only upgraded with --jsonUpgraded', () => {
    return spawn('node', ['bin/ncu.js', '--jsonUpgraded'], '{ "dependencies": { "express": "1" } }')
      .then(JSON.parse)
      .then(pkgData => {
        pkgData.should.have.property('express')
      })
  })

  it('should read --packageFile', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      const text = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--packageFile', tempFile])
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('should write to --packageFile', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', ['bin/npm-check-updates.js', '-u', '--packageFile', tempFile])
      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('should write to --packageFile if errorLevel=2 and upgrades', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

    try {
      const result = await spawn('node', ['bin/ncu.js', '-u', '--errorLevel', '2', '--packageFile', tempFile])
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

  it('should write to --packageFile with jsonUpgraded flag', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', ['bin/npm-check-updates.js', '-u', '--jsonUpgraded', '--packageFile', tempFile])
      const ugradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      ugradedPkg.should.have.property('dependencies')
      ugradedPkg.dependencies.should.have.property('express')
      ugradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('should ignore stdin if --packageFile is specified', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')
    try {
      await spawn('node', ['bin/npm-check-updates.js', '-u', '--packageFile', tempFile], '{ "dependencies": {}}')
      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('should filter by package name with --filter', () => {
    return spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--filter', 'express'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      .then(JSON.parse)
      .then(pkgData => {
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      })
  })

  it('should filter by package name with -f', () => {
    return spawn('node', ['bin/ncu.js', '--jsonUpgraded', '-f', 'express'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      .then(JSON.parse)
      .then(pkgData => {
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      })
  })

  it('should reject by package name with --reject', () => {
    return spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--reject', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      .then(JSON.parse)
      .then(pkgData => {
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      })
  })

  it('should reject by package name with -x', () => {
    return spawn('node', ['bin/ncu.js', '--jsonUpgraded', '-x', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      .then(JSON.parse)
      .then(pkgData => {
        pkgData.should.have.property('express')
        pkgData.should.not.have.property('chalk')
      })
  })

  describe('target', () => {

    it('should not update major versions with --target minor', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'minor'], '{ "dependencies": { "chalk": "3.0.0" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.not.have.property('chalk')
    })

    it('should update minor versions with --target minor', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'minor'], '{ "dependencies": { "chalk": "2.3.0" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('should update patch versions with --target patch', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'patch'], '{ "dependencies": { "chalk": "2.4.1" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('should not update major versions with --target patch', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'patch'], '{ "dependencies": { "chalk": "3.0.0" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.not.have.property('chalk')
    })

    it('should not update minor versions with --target patch', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'patch'], '{ "dependencies": { "chalk": "2.3.2" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.not.have.property('chalk')
    })

    it('should skip non-semver versions with --target', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'patch'], '{ "dependencies": { "test": "github:a/b" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.not.have.property('test')
    })

    it('should update patch versions with --target patch', async () => {
      const output = await spawn('node', ['bin/ncu.js', '--jsonUpgraded', '--target', 'patch'], '{ "dependencies": { "chalk": "2.4.1" } }')
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

  }) // end 'target'

  it('should suppress stdout when --silent is provided', () => {
    return spawn('node', ['bin/ncu.js', '--silent'], '{ "dependencies": { "express": "1" } }')
      .then(output => {
        output.trim().should.equal('')
      })
  })

  it('should read --configFilePath', async () => {
    const tempFilePath = './test/'
    const tempFileName = '.ncurc.json'
    fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
    try {
      const text = await spawn('node', ['bin/ncu.js', '--configFilePath', tempFilePath], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    }
    finally {
      fs.unlinkSync(tempFilePath + tempFileName)
    }
  })

  it('should read --configFileName', async () => {
    const tempFilePath = './test/'
    const tempFileName = '.rctemp.json'
    fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
    try {
      const text = await spawn('node', ['bin/ncu.js', '--configFilePath', tempFilePath, '--configFileName', tempFileName], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    }
    finally {
      fs.unlinkSync(tempFilePath + tempFileName)
    }
  })

  it('should override config with arguments', async () => {
    const tempFilePath = './test/'
    const tempFileName = '.ncurc.json'
    fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8')
    try {
      const text = await spawn('node', ['bin/ncu.js', '--configFilePath', tempFilePath, '--filter', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('chalk')
      pkgData.should.not.have.property('express')
    }
    finally {
      fs.unlinkSync(tempFilePath + tempFileName)
    }
  })

  describe('with timeout option', () => {

    it('should exit with error when timeout exceeded', () => {
      return spawn('node', ['bin/ncu.js', '--timeout', '1'], '{ "dependencies": { "express": "1" } }')
        .should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
    })

    it('completes successfully with timeout', () => {
      return spawn('node', ['bin/ncu.js', '--timeout', '100000'], '{ "dependencies": { "express": "1" } }')
    })
  })
})
