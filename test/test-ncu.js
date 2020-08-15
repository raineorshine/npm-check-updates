'use strict'

const fs = require('fs')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const chaiString = require('chai-string')
const ncu = require('../lib/npm-check-updates')

chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = true

describe('run', function () {

  let last = 0
  function getTempFile() {
    return `test/temp_package${++last}.json`
  }
  this.timeout(30000)

  it('should return promised jsonUpgraded', () => {
    return ncu.run({
      packageData: fs.readFileSync(`${__dirname}/ncu/package.json`, 'utf-8')
    }).should.eventually.have.property('express')
  })

  it('should filter by package name with one arg', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(`${__dirname}/ncu/package2.json`, 'utf-8'),
      args: ['lodash.map']
    })
    return Promise.all([
      upgraded.should.eventually.have.property('lodash.map'),
      upgraded.should.eventually.not.have.property('lodash.filter')
    ])
  })

  it('should filter by package name with multiple args', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(`${__dirname}/ncu/package2.json`, 'utf-8'),
      args: ['lodash.map', 'lodash.filter']
    })
    return Promise.all([
      upgraded.should.eventually.have.property('lodash.map'),
      upgraded.should.eventually.have.property('lodash.filter')
    ])
  })

  it('should suggest upgrades to versions within the specified version range if jsonUpgraded is true', () => {
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

  it('should not suggest upgrades to versions within the specified version range if jsonUpgraded is true and minimial is true', () => {
    const upgraded = ncu.run({
      // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
      packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
      jsonUpgraded: true,
      minimal: true
    })

    return upgraded.should.eventually.not.have.property('juggernaut')
  })

  it('should use package.json in cwd by default', () => {
    return ncu.run({})
  })

  it('should throw an exception instead of printing to the console when timeout is exceeded', () => {
    return ncu.run({
      packageData: fs.readFileSync(`${__dirname}/ncu/package-large.json`, 'utf-8'),
      timeout: 1
    })
      .should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
  })

  it('should only upgrade devDependencies and peerDependencies with --dep dev', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(`${__dirname}/ncu/package-dep.json`, 'utf-8'),
      dep: 'dev'
    })

    return Promise.all([
      upgraded.should.eventually.not.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.not.have.property('mocha')
    ])
  })

  it('should only upgrade devDependencies and peerDependencies with --dep dev,peer', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(`${__dirname}/ncu/package-dep.json`, 'utf-8'),
      dep: 'dev,peer'
    })

    return Promise.all([
      upgraded.should.eventually.not.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.have.property('mocha')
    ])
  })

  it('should write to --packageFile and output jsonUpgraded', async () => {

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

  it('should exclude -alpha, -beta, -rc', () => {

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

  it('should upgrade prereleases to newer prereleases', () => {

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

  it('should not upgrade prereleases to newer prereleases with --pre 0', () => {

    return ncu.run({
      pre: false,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1'
        }
      })
    }).then(data => {
      return data.should.eql({})
    })
  })

  it('should include -alpha, -beta, -rc with --pre option', () => {

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

  it('should not require --pre with --newest option', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      newest: true
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0'
        }
      })
    })
  })

  it('should not require --pre with --greatest option', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      greatest: true
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0'
        }
      })
    })
  })

  it('should allow --pre 0 with --newest option to exclude prereleases', () => {

    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      }),
      newest: true,
      pre: '0'
    }).then(data => {
      return data.should.eql({
        dependencies: {
          'ncu-mock-pre': '1.0.0'
        }
      })
    })
  })

  it('should work with --newest option with any invalid or wildcard range', () => {
    return Promise.all([
      ncu.run({
        jsonAll: true,
        newest: true,
        packageData: JSON.stringify({
          dependencies: {
            del: ''
          }
        })
      }),
      ncu.run({
        jsonAll: true,
        newest: true,
        packageData: JSON.stringify({
          dependencies: {
            del: 'invalid range'
          }
        })
      }),
      ncu.run({
        jsonAll: true,
        newest: true,
        packageData: JSON.stringify({
          dependencies: {
            del: '*'
          }
        })
      }),
      ncu.run({
        jsonAll: true,
        newest: true,
        packageData: JSON.stringify({
          dependencies: {
            del: '~'
          }
        })
      })
    ])
  })

  it('should enable --enginesNode matching ', () => {
    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        },
        engines: {
          node: '>=6'
        }
      }),
      enginesNode: true
    }).then(data => {
      return data.should.eql({
        dependencies: {
          del: '4.1.1'
        },
        engines: {
          node: '>=6'
        }
      })
    })
  })

  it('should enable engines matching if --enginesNode', () => {
    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        },
        engines: {
          node: '>=6'
        }
      }),
      enginesNode: true
    }).then(upgradedPkg => {
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('del')
      upgradedPkg.dependencies.del.should.equal('4.1.1')
    })
  })

  it('should enable engines matching if --enginesNode, not update if matches not exists', () => {
    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        },
        engines: {
          node: '>=1'
        }
      }),
      enginesNode: true
    }).then(upgradedPkg => {
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('del')
      upgradedPkg.dependencies.del.should.equal('3.0.0')
    })
  })

  it('should enable engines matching if --enginesNode, update to latest version if engines.node not exists', () => {
    return ncu.run({
      jsonAll: true,
      packageData: JSON.stringify({
        dependencies: {
          del: '3.0.0'
        }
      }),
      enginesNode: true
    }).then(upgradedPkg => {
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('del')
      upgradedPkg.dependencies.del.should.not.equal('3.0.0')
      upgradedPkg.dependencies.del.should.not.equal('4.1.1')
    })
  })

  it('should not allow --greatest and --newest together', async () => {
    ncu.run({ greatest: true, newest: true })
      .should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('should not allow --target and --greatest together', async () => {
    ncu.run({ target: 'greatest', newest: true })
      .should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('should not allow --target and --newest together', async () => {
    ncu.run({ target: 'newest', greatest: true })
      .should.eventually.be.rejectedWith('Cannot specify both')
  })

})
