'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const chaiString = require('chai-string')
const ncu = require('../src/')

chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = true

describe('run', function () {

  let last = 0

  /** Gets the temporary package file path. */
  function getTempFile() {
    return `test/temp_package${++last}.json`
  }

  it('return promised jsonUpgraded', () => {
    return ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, 'ncu/package.json'), 'utf-8')
    }).should.eventually.have.property('express')
  })

  it('pass object as packageData', () => {
    return ncu.run({
      packageData: {
        dependencies: {
          'ncu-test-v2': '1.0.0'
        }
      },
    }).should.eventually.have.property('ncu-test-v2')
  })

  it('suggest upgrades to versions within the specified version range if jsonUpgraded is true', () => {
    const upgraded = ncu.run({
      // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
      packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
      jsonUpgraded: true
    })

    return Promise.all([
      upgraded.should.eventually.have.property('juggernaut'),
      upgraded.then(data => {
        return data.should.eql({ juggernaut: '^2.1.1' })
      })
    ])
  })

  it('do not suggest upgrades to versions within the specified version range if jsonUpgraded is true and minimial is true', () => {
    const upgraded = ncu.run({
      // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
      packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
      jsonUpgraded: true,
      minimal: true
    })

    return upgraded.should.eventually.not.have.property('juggernaut')
  })

  it('do not upgrade peerDependencies by default', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, '/ncu/package-dep.json'), 'utf-8')
    })

    return Promise.all([
      upgraded.should.eventually.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.not.have.property('mocha')
    ])
  })

  it('only upgrade devDependencies with --dep dev', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, 'ncu/package-dep.json'), 'utf-8'),
      dep: 'dev'
    })

    return Promise.all([
      upgraded.should.eventually.not.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.not.have.property('mocha')
    ])
  })

  it('only upgrade devDependencies and peerDependencies with --dep dev,peer', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, 'ncu/package-dep.json'), 'utf-8'),
      dep: 'dev,peer'
    })

    return Promise.all([
      upgraded.should.eventually.not.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.have.property('mocha')
    ])
  })

  it('write to --packageFile and output jsonUpgraded', async () => {

    const tempFile = getTempFile()
    fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

    try {
      const result = await ncu.run({
        packageFile: tempFile,
        jsonUpgraded: true,
        upgrade: true
      })
      result.should.have.property('express')

      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
    }
    finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('exclude -alpha, -beta, -rc', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      })
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      })
    })
  })

  it('upgrade prereleases to newer prereleases', () => {

    return ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1'
        }
      })
    }).then(data => {
      return data.should.eql({
        'ncu-test-alpha-latest': '1.0.0-alpha.2'
      })
    })
  })

  it('do not upgrade prereleases to newer prereleases with --pre 0', () => {

    return ncu.run({
      pre: 0,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1'
        }
      })
    }).then(data => {
      return data.should.eql({})
    })
  })

  it('include -alpha, -beta, -rc with --pre option', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      pre: 1
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0'
        }
      })
    })
  })

  it('do not require --pre with --target newest', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      target: 'newest'
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0'
        }
      })
    })
  })

  it('do not require --pre with --target greatest', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      target: 'greatest'
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0'
        }
      })
    })
  })

  it('allow --pre 0 with --target newest to exclude prereleases', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      target: 'newest',
      pre: 0
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      })
    })
  })

  it('work with --target newest with any invalid or wildcard range', () => {
    return Promise.all([
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: ''
          }
        })
      }),
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: 'invalid range'
          }
        })
      }),
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: '*'
          }
        })
      }),
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: '~'
          }
        })
      })
    ])
  })

  describe('deprecated', () => {

    it('deprecated excluded by default', async () => {
      const upgrades = await ncu.run({
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-deprecated': '1.0.0'
          }
        })
      })
      upgrades.should.deep.equal({})
    })

    it('deprecated included with option', async () => {
      const upgrades = await ncu.run({
        deprecated: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-deprecated': '1.0.0'
          }
        })
      })
      upgrades.should.deep.equal({
        'ncu-test-deprecated': '2.0.0'
      })
    })

  })

  describe('target', () => {

    it('do not allow --greatest and --newest together', async () => {
      ncu.run({ greatest: true, target: 'newest' })
        .should.eventually.be.rejectedWith('Cannot specify both')
      ncu.run({ target: 'greatest', newest: true })
        .should.eventually.be.rejectedWith('Cannot specify both')
      ncu.run({ greatest: true, newest: true })
        .should.eventually.be.rejectedWith('Cannot specify both')
    })

    it('do not allow --target and --greatest together', async () => {
      ncu.run({ target: 'greatest', greatest: true })
        .should.eventually.be.rejectedWith('Cannot specify both')
    })

    it('do not allow --target and --newest together', async () => {
      ncu.run({ target: 'newest', newest: true })
        .should.eventually.be.rejectedWith('Cannot specify both')
    })

    it('do not update major versions with --target minor', async () => {
      const pkgData = await ncu.run({ target: 'minor', packageData: '{ "dependencies": { "chalk": "3.0.0" } }' })
      pkgData.should.not.have.property('chalk')
    })

    it('update minor versions with --target minor', async () => {
      const pkgData = await ncu.run({ target: 'minor', packageData: '{ "dependencies": { "chalk": "2.3.0" } }' })
      pkgData.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('update patch versions with --target minor', async () => {
      const pkgData = await ncu.run({ target: 'minor', packageData: '{ "dependencies": { "chalk": "2.4.0" } }' })
      pkgData.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('do not update major versions with --target patch', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "chalk": "3.0.0" } }' })
      pkgData.should.not.have.property('chalk')
    })

    it('do not update minor versions with --target patch', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "chalk": "2.3.2" } }' })
      pkgData.should.not.have.property('chalk')
    })

    it('update patch versions with --target patch', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "chalk": "2.4.1" } }' })
      pkgData.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('skip non-semver versions with --target', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "test": "github:a/b" } }' })
      pkgData.should.not.have.property('test')
    })

  }) // end 'target'

  describe('filterVersion', () => {

    it('filter by package version with string', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '1.0.0',
      })

      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-return-version')
    })

    it('filter by package version with space-delimited list of strings', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '1.0.0 0.1.0',
      })

      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-return-version')
      upgraded.should.have.property('fp-and-or')
    })

    it('filter by package version with comma-delimited list of strings', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '1.0.0,0.1.0',
      })

      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-return-version')
      upgraded.should.have.property('fp-and-or')
    })

    it('filter by package version with RegExp', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: /^1/,
      })

      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-return-version')
      upgraded.should.not.have.property('fp-and-or')
    })

    it('filter by package version with RegExp string', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '/^1/',
      })

      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-return-version')
      upgraded.should.not.have.property('fp-and-or')
    })

  })

  describe('rejectVersion', () => {

    it('reject by package version with string', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '1.0.0',
      })

      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-return-version')
    })

    it('reject by package version with space-delimited list of strings', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '1.0.0 0.1.0',
      })

      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-return-version')
      upgraded.should.not.have.property('fp-and-or')
    })

    it('reject by package version with comma-delimited list of strings', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '1.0.0,0.1.0',
      })

      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-return-version')
      upgraded.should.not.have.property('fp-and-or')
    })

    it('reject by package version with RegExp', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: /^1/,
      })

      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-return-version')
      upgraded.should.have.property('fp-and-or')
    })

    it('reject by package version with RegExp string', async () => {

      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        }
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '/^1/',
      })

      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-return-version')
      upgraded.should.have.property('fp-and-or')
    })

  })

  it('ignore non-string versions (sometimes used as comments)', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          '//': ['This is a comment']
        }
      })
    })
    upgrades.should.deep.equal({})
  })

  it('update devDependency when duplicate dependency is up-to-date', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^2.0.0'
        },
        devDependencies: {
          'ncu-test-v2': '^1.0.0'
        }
      })
    })
    upgrades.should.deep.equal({
      'ncu-test-v2': '^2.0.0'
    })
  })

  it('update dependency when duplicate devDependency is up-to-date', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0'
        },
        devDependencies: {
          'ncu-test-v2': '^2.0.0'
        }
      })
    })
    upgrades.should.deep.equal({
      'ncu-test-v2': '^2.0.0'
    })
  })

})
