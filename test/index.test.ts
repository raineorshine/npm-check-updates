import os from 'os'
import fs from 'fs'
import path from 'path'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import * as ncu from '../src/'
import { FilterFunction } from '../src/types/FilterFunction'
import { TargetFunction } from '../src/types/TargetFunction'
import { Index } from '../src/types/IndexType'
import { Version } from '../src/types/Version'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('run', function () {
  it('return promised jsonUpgraded', () => {
    return ncu
      .run({
        packageData: fs.readFileSync(path.join(__dirname, 'ncu/package.json'), 'utf-8'),
      })
      .should.eventually.have.property('express')
  })

  it('pass object as packageData', () => {
    return ncu
      .run({
        packageData: {
          dependencies: {
            'ncu-test-v2': '1.0.0',
          },
        },
      })
      .should.eventually.have.property('ncu-test-v2')
  })

  it('suggest upgrades to versions within the specified version range if jsonUpgraded is true', () => {
    const upgraded = ncu.run({
      // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
      packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
      jsonUpgraded: true,
    })

    return Promise.all([
      upgraded.should.eventually.have.property('juggernaut'),
      upgraded.then(data => {
        return data!.should.eql({ juggernaut: '^2.1.1' })
      }),
    ])
  })

  it('do not suggest upgrades to versions within the specified version range if jsonUpgraded is true and minimial is true', () => {
    const upgraded = ncu.run({
      // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
      packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
      jsonUpgraded: true,
      minimal: true,
    })

    return upgraded.should.eventually.not.have.property('juggernaut')
  })

  it('do not upgrade peerDependencies by default', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, '/ncu/package-dep.json'), 'utf-8'),
    })

    return Promise.all([
      upgraded.should.eventually.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.not.have.property('mocha'),
    ])
  })

  it('only upgrade devDependencies with --dep dev', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, 'ncu/package-dep.json'), 'utf-8'),
      dep: 'dev',
    })

    return Promise.all([
      upgraded.should.eventually.not.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.not.have.property('mocha'),
    ])
  })

  it('only upgrade devDependencies and peerDependencies with --dep dev,peer', () => {
    const upgraded = ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, 'ncu/package-dep.json'), 'utf-8'),
      dep: 'dev,peer',
    })

    return Promise.all([
      upgraded.should.eventually.not.have.property('express'),
      upgraded.should.eventually.have.property('chalk'),
      upgraded.should.eventually.have.property('mocha'),
    ])
  })

  it('write to --packageFile and output jsonUpgraded', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    fs.writeFileSync(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

    try {
      const result = await ncu.run({
        packageFile: pkgFile,
        jsonUpgraded: true,
        upgrade: true,
      })
      result!.should.have.property('express')

      const upgradedPkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
    } finally {
      fs.unlinkSync(pkgFile)
    }
  })

  it('exclude -alpha, -beta, -rc', () => {
    return ncu
      .run({
        jsonAll: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        }),
      })
      .then(data => {
        return data!.should.eql({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        })
      })
  })

  it('upgrade prereleases to newer prereleases', () => {
    return ncu
      .run({
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-alpha-latest': '1.0.0-alpha.1',
          },
        }),
      })
      .then(data => {
        return data!.should.eql({
          'ncu-test-alpha-latest': '1.0.0-alpha.2',
        })
      })
  })

  it('do not upgrade prereleases to newer prereleases with --pre 0', () => {
    return ncu
      .run({
        pre: false,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-alpha-latest': '1.0.0-alpha.1',
          },
        }),
      })
      .then(data => {
        return data!.should.eql({})
      })
  })

  it('include -alpha, -beta, -rc with --pre option', () => {
    return ncu
      .run({
        jsonAll: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        }),
        pre: true,
      })
      .then(data => {
        return data!.should.eql({
          dependencies: {
            'ncu-mock-pre': '2.0.0-alpha.0',
          },
        })
      })
  })

  it('do not require --pre with --target newest', () => {
    return ncu
      .run({
        jsonAll: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        }),
        target: 'newest',
      })
      .then(data => {
        return data!.should.eql({
          dependencies: {
            'ncu-mock-pre': '2.0.0-alpha.0',
          },
        })
      })
  })

  it('do not require --pre with --target greatest', () => {
    return ncu
      .run({
        jsonAll: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        }),
        target: 'greatest',
      })
      .then(data => {
        return data!.should.eql({
          dependencies: {
            'ncu-mock-pre': '2.0.0-alpha.0',
          },
        })
      })
  })

  it('allow --pre 0 with --target newest to exclude prereleases', () => {
    return ncu
      .run({
        jsonAll: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        }),
        target: 'newest',
        pre: false,
      })
      .then(data => {
        return data!.should.eql({
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
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
            del: '',
          },
        }),
      }),
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: 'invalid range',
          },
        }),
      }),
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: '*',
          },
        }),
      }),
      ncu.run({
        jsonAll: true,
        target: 'newest',
        packageData: JSON.stringify({
          dependencies: {
            del: '~',
          },
        }),
      }),
    ])
  })

  describe('deprecated', () => {
    it('deprecated excluded by default', async () => {
      const upgrades = await ncu.run({
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-deprecated': '1.0.0',
          },
        }),
      })
      upgrades!.should.deep.equal({})
    })

    it('deprecated included with option', async () => {
      const upgrades = await ncu.run({
        deprecated: true,
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-deprecated': '1.0.0',
          },
        }),
      })
      upgrades!.should.deep.equal({
        'ncu-test-deprecated': '2.0.0',
      })
    })
  })

  describe('target', () => {
    it('do not update major versions with --target minor', async () => {
      const pkgData = await ncu.run({ target: 'minor', packageData: '{ "dependencies": { "chalk": "3.0.0" } }' })
      pkgData!.should.not.have.property('chalk')
    })

    it('update minor versions with --target minor', async () => {
      const pkgData = (await ncu.run({
        target: 'minor',
        packageData: '{ "dependencies": { "chalk": "2.3.0" } }',
      })) as Index<Version>
      pkgData!.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('update patch versions with --target minor', async () => {
      const pkgData = (await ncu.run({
        target: 'minor',
        packageData: '{ "dependencies": { "chalk": "2.4.0" } }',
      })) as Index<Version>
      pkgData!.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('do not update major versions with --target patch', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "chalk": "3.0.0" } }' })
      pkgData!.should.not.have.property('chalk')
    })

    it('do not update minor versions with --target patch', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "chalk": "2.3.2" } }' })
      pkgData!.should.not.have.property('chalk')
    })

    it('update patch versions with --target patch', async () => {
      const pkgData = (await ncu.run({
        target: 'patch',
        packageData: '{ "dependencies": { "chalk": "2.4.1" } }',
      })) as Index<Version>
      pkgData!.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('skip non-semver versions with --target patch', async () => {
      const pkgData = await ncu.run({ target: 'patch', packageData: '{ "dependencies": { "test": "github:a/b" } }' })
      pkgData!.should.not.have.property('test')
    })

    it('custom target function to mimic semver', async () => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const target: TargetFunction = (name, [{ operator }]) =>
        operator === '^' ? 'minor' : operator === '~' ? 'patch' : 'latest'
      const pkgData = (await ncu.run({
        target,
        packageData: JSON.stringify({
          dependencies: {
            'eslint-plugin-jsdoc': '~36.1.0',
            jsonlines: '0.1.0',
            juggernaut: '1.0.0',
            mocha: '^8.3.2',
          },
        }),
      })) as Index<Version>
      pkgData!.should.have.property('eslint-plugin-jsdoc')
      pkgData['eslint-plugin-jsdoc'].should.equal('~36.1.1')
      pkgData!.should.have.property('jsonlines')
      pkgData.jsonlines.should.equal('0.1.1')
      pkgData!.should.have.property('juggernaut')
      pkgData.juggernaut.should.equal('2.1.1')
      pkgData!.should.have.property('mocha')
      pkgData.mocha.should.equal('^8.4.0')
    })

    it('custom target and filter function to mimic semver', async () => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const target: TargetFunction = (name, [{ operator }]) =>
        operator === '^' ? 'minor' : operator === '~' ? 'patch' : 'latest'
      // eslint-disable-next-line jsdoc/require-jsdoc
      const filter: FilterFunction = (_, [{ major, operator }]) =>
        !(major === '0' || major === undefined || operator === undefined)
      const pkgData = (await ncu.run({
        filter,
        target,
        packageData: JSON.stringify({
          dependencies: {
            'eslint-plugin-jsdoc': '~36.1.0',
            jsonlines: '0.1.0',
            juggernaut: '1.0.0',
            mocha: '^8.3.2',
          },
        }),
      })) as Index<Version>
      pkgData!.should.have.property('eslint-plugin-jsdoc')
      pkgData['eslint-plugin-jsdoc'].should.equal('~36.1.1')
      pkgData!.should.not.have.property('jsonlines')
      pkgData!.should.not.have.property('juggernaut')
      pkgData!.should.have.property('mocha')
      pkgData.mocha.should.equal('^8.4.0')
    })
  }) // end 'target'

  describe('distTag as target', () => {
    it('upgrade nonprerelease version to specific tag', async () => {
      const upgraded = (await ncu.run({
        target: '@next',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '0.1.0',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.0.0-1')
    })

    it('upgrade prerelease version without preid to nonprerelease', async () => {
      const upgraded = (await ncu.run({
        target: 'latest',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.0.0-1',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.1.0')
    })

    it('upgrade prerelease version with preid to higher version on a specific tag', async () => {
      const upgraded = (await ncu.run({
        target: '@beta',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.0.0-task-42.0',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.0.1-beta.0')
    })

    // can't detect which prerelease is higher, so just allow switching
    it('upgrade from prerelease without preid to prerelease with preid at a specific tag if major.minor.patch is the same', async () => {
      const upgraded = (await ncu.run({
        target: '@task-42',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.0.0-beta.0',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.0.0-task-42.0')
    })

    // need to test reverse order too, because by base semver logic preid are sorted alphabetically
    it('upgrade from prerelease with preid to prerelease without preid at a specific tag if major.minor.patch is the same', async () => {
      const upgraded = (await ncu.run({
        target: '@next',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.0.0-task-42.0',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.0.0-1')
    })

    // comparing semver between different dist-tags is incorrect, both versions could be released from the same latest
    // so instead of looking at numbers, we should focus on intention of the user upgrading to specific dist-tag
    it('downgrade to tag with a non-matching preid and lower patch', async () => {
      const upgraded = (await ncu.run({
        target: '@task-42',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.0.1-beta.0',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.0.0-task-42.0')
    })

    // same as previous, doesn't matter if it's patch, minor or major, comparing different dist-tags is incorrect
    it('downgrade to tag with a non-matching preid and lower minor', async () => {
      const upgraded = (await ncu.run({
        target: '@next',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.2.0-dev.0',
          },
        }),
      })) as Index<Version>

      upgraded['ncu-test-tag'].should.equal('1.0.0-1')
    })

    it('do not downgrade nonprerelease version to lower version with with specific tag', async () => {
      const upgraded = await ncu.run({
        target: '@next',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.1.0',
          },
        }),
      })

      upgraded!.should.not.have.property('ncu-test-tag')
    })

    it('do not downgrade to latest with lower version', async () => {
      const upgraded = await ncu.run({
        target: 'latest',
        packageData: JSON.stringify({
          dependencies: {
            'ncu-test-tag': '1.1.1-beta.0',
          },
        }),
      })

      upgraded!.should.not.have.property('ncu-test-tag')
    })
  }) // end 'distTAg as target'

  describe('filterVersion', () => {
    it('filter by package version with string', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '1.0.0',
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.not.have.property('ncu-test-return-version')
    })

    it('filter by package version with space-delimited list of strings', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '1.0.0 0.1.0',
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.not.have.property('ncu-test-return-version')
      upgraded!.should.have.property('fp-and-or')
    })

    it('filter by package version with comma-delimited list of strings', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '1.0.0,0.1.0',
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.not.have.property('ncu-test-return-version')
      upgraded!.should.have.property('fp-and-or')
    })

    it('filter by package version with RegExp', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: /^1/,
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.have.property('ncu-test-return-version')
      upgraded!.should.not.have.property('fp-and-or')
    })

    it('filter by package version with RegExp string', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        filterVersion: '/^1/',
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.have.property('ncu-test-return-version')
      upgraded!.should.not.have.property('fp-and-or')
    })
  })

  describe('rejectVersion', () => {
    it('reject by package version with string', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '1.0.0',
      })

      upgraded!.should.not.have.property('ncu-test-v2')
      upgraded!.should.have.property('ncu-test-return-version')
    })

    it('reject by package version with space-delimited list of strings', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '1.0.0 0.1.0',
      })

      upgraded!.should.not.have.property('ncu-test-v2')
      upgraded!.should.have.property('ncu-test-return-version')
      upgraded!.should.not.have.property('fp-and-or')
    })

    it('reject by package version with comma-delimited list of strings', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '1.0.0,0.1.0',
      })

      upgraded!.should.not.have.property('ncu-test-v2')
      upgraded!.should.have.property('ncu-test-return-version')
      upgraded!.should.not.have.property('fp-and-or')
    })

    it('reject by package version with RegExp', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: /^1/,
      })

      upgraded!.should.not.have.property('ncu-test-v2')
      upgraded!.should.not.have.property('ncu-test-return-version')
      upgraded!.should.have.property('fp-and-or')
    })

    it('reject by package version with RegExp string', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu.run({
        packageData: JSON.stringify(pkg),
        rejectVersion: '/^1/',
      })

      upgraded!.should.not.have.property('ncu-test-v2')
      upgraded!.should.not.have.property('ncu-test-return-version')
      upgraded!.should.have.property('fp-and-or')
    })
  })

  it('ignore non-string versions (sometimes used as comments)', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          '//': ['This is a comment'],
        },
      }),
    })
    upgrades!.should.deep.equal({})
  })

  it('update devDependency when duplicate dependency is up-to-date', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^2.0.0',
        },
        devDependencies: {
          'ncu-test-v2': '^1.0.0',
        },
      }),
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': '^2.0.0',
    })
  })

  it('update dependency when duplicate devDependency is up-to-date', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
        },
        devDependencies: {
          'ncu-test-v2': '^2.0.0',
        },
      }),
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': '^2.0.0',
    })
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1129
  it('ignore invalid semver version', async () => {
    const upgrades = await ncu.run({
      // needed to cause the npm package handler to use greatest or newest and compare all published versions
      target: 'minor',
      packageData: {
        dependencies: {
          // grunt-contrib-requirejs contains 0.4.0rc7 which is not valid semver
          'grunt-contrib-requirejs': '0.3.0',
        },
      },
    })
    upgrades!.should.haveOwnProperty('grunt-contrib-requirejs')
  })
})
