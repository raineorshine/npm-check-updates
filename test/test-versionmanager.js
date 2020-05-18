'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const vm = require('../lib/versionmanager')

const should = chai.should()

chai.use(chaiAsPromised)

describe('versionmanager', () => {

  describe('upgradeDependencyDeclaration', () => {
    it('numeric upgrades', () => {
      vm.upgradeDependencyDeclaration('0', '1.0.0').should.equal('1')
      vm.upgradeDependencyDeclaration('1', '10.0.0').should.equal('10')

      vm.upgradeDependencyDeclaration('0.1', '1.0.0').should.equal('1.0')
      vm.upgradeDependencyDeclaration('1.0', '1.1.0').should.equal('1.1')

      vm.upgradeDependencyDeclaration('1.0.0', '1.0.1').should.equal('1.0.1')
      vm.upgradeDependencyDeclaration('1.0.1', '1.1.0').should.equal('1.1.0')
      vm.upgradeDependencyDeclaration('2.0.1', '2.0.11').should.equal('2.0.11')
    })

    it('wildcard upgrades', () => {
      vm.upgradeDependencyDeclaration('1.x', '1.1.0').should.equal('1.x')
      vm.upgradeDependencyDeclaration('1.x.1', '1.1.2').should.equal('1.x.2')
      vm.upgradeDependencyDeclaration('1.0.x', '1.1.1').should.equal('1.1.x')
      vm.upgradeDependencyDeclaration('1.0.x', '1.1.0').should.equal('1.1.x')
      vm.upgradeDependencyDeclaration('1.0.x', '2.0.0').should.equal('2.0.x')

      vm.upgradeDependencyDeclaration('*', '1.0.0').should.equal('*')
      vm.upgradeDependencyDeclaration('1.*', '2.0.1').should.equal('2.*')

      vm.upgradeDependencyDeclaration('^*', '1.0.0').should.equal('^*')

      vm.upgradeDependencyDeclaration('x', '1.0.0').should.equal('x')
      vm.upgradeDependencyDeclaration('x.x', '1.0.0').should.equal('x.x')
      vm.upgradeDependencyDeclaration('x.x.x', '1.0.0').should.equal('x.x.x')
    })

    it('should convert < to ^', () => {
      vm.upgradeDependencyDeclaration('<1.0', '1.1.0').should.equal('^1.1')
    })

    it('should preserve > and >=', () => {
      vm.upgradeDependencyDeclaration('>1.0', '2.0.0').should.equal('>2.0')
      vm.upgradeDependencyDeclaration('>=1.0', '2.0.0').should.equal('>=2.0')
    })

    it('should preserve ^ and ~', () => {
      vm.upgradeDependencyDeclaration('^1.2.3', '1.2.4').should.equal('^1.2.4')
      vm.upgradeDependencyDeclaration('~1.2.3', '1.2.4').should.equal('~1.2.4')
    })

    it('should preserve prerelease versons', () => {
      vm.upgradeDependencyDeclaration('^0.15.7', '0.16.0-beta.3').should.equal('^0.16.0-beta.3')
    })

    it('should replace multiple ranges with ^', () => {
      vm.upgradeDependencyDeclaration('>1.0 >2.0 < 3.0', '3.1.0').should.equal('^3.1')
    })

    it('should handle ||', () => {
      vm.upgradeDependencyDeclaration('~1.0 || ~1.2', '3.1.0').should.equal('~3.1')
    })

    it('should hyphen (-) range', () => {
      vm.upgradeDependencyDeclaration('1.0 - 2.0', '3.1.0').should.equal('3.1')
    })

    it('should use the range with the fewest parts if there are multiple ranges', () => {
      vm.upgradeDependencyDeclaration('1.1 || 1.2.0', '3.1.0').should.equal('3.1')
      vm.upgradeDependencyDeclaration('1.2.0 || 1.1', '3.1.0').should.equal('3.1')
    })

    it('should preserve wildcards in comparisons', () => {
      vm.upgradeDependencyDeclaration('1.x < 1.2.0', '3.1.0').should.equal('3.x')
    })

    it('should use the first operator if a comparison has mixed operators', () => {
      vm.upgradeDependencyDeclaration('1.x < 1.*', '3.1.0').should.equal('3.x')
    })

    it('maintain \'unclean\' semantic versions', () => {
      vm.upgradeDependencyDeclaration('v1.0', '1.1').should.equal('v1.1')
      vm.upgradeDependencyDeclaration('=v1.0', '1.1').should.equal('=v1.1')
      vm.upgradeDependencyDeclaration(' =v1.0', '1.1').should.equal('=v1.1')
    })

    it('maintain \'unclean\' semantic versions', () => {
      vm.upgradeDependencyDeclaration('v1.0', '1.1').should.equal('v1.1')
      vm.upgradeDependencyDeclaration('=v1.0', '1.1').should.equal('=v1.1')
      vm.upgradeDependencyDeclaration(' =v1.0', '1.1').should.equal('=v1.1')
    })

    it('maintain existing version if new version is unknown', () => {
      vm.upgradeDependencyDeclaration('1.0', '').should.equal('1.0')
      vm.upgradeDependencyDeclaration('1.0', null).should.equal('1.0')
    })

    it('should remove semver range if removeRange option is specified', () => {
      vm.upgradeDependencyDeclaration('^1.0.0', '1.0.1', { removeRange: true }).should.equal('1.0.1')
      vm.upgradeDependencyDeclaration('2.2.*', '3.1.1', { removeRange: true }).should.equal('3.1.1')
    })
  })

  describe('upgradePackageData', () => {
    const pkgData = JSON.stringify({
      name: 'npm-check-updates',
      dependencies: {
        bluebird: '<2.0',
        bindings: '^1.1.0'
      },
      devDependencies: {
        mocha: '^1'
      }
    })
    const oldDependencies = {
      bluebird: '<2.0',
      bindings: '^1.1.0',
      mocha: '^1'
    }
    const newDependencies = {
      bluebird: '^2.9',
      bindings: '^1.2.1',
      mocha: '^2'
    }
    const newVersions = {
      bluebird: '2.9.0',
      bindings: '1.2.1',
      mocha: '2.2.5'
    }

    it('should upgrade the dependencies in the given package data (including satisfied)', async () => {
      const { newPkgData } = await vm.upgradePackageData(pkgData, oldDependencies, newDependencies, newVersions)
      JSON.parse(newPkgData)
        .should.eql({
          name: 'npm-check-updates',
          dependencies: {
            bluebird: '^2.9',
            bindings: '^1.2.1'
          },
          devDependencies: {
            mocha: '^2'
          }
        })
    })

    it('should upgrade the dependencies in the given package data (except for satisfied)', async () => {
      const { newPkgData } = await vm.upgradePackageData(pkgData, oldDependencies, newDependencies, newVersions, { minimal: true })
      JSON.parse(newPkgData)
        .should.eql({
          name: 'npm-check-updates',
          dependencies: {
            bluebird: '^2.9',
            bindings: '^1.1.0'
          },
          devDependencies: {
            mocha: '^2'
          }
        })
    })
  })

  describe('getCurrentDependencies', () => {

    let deps
    beforeEach(() => {
      deps = {
        dependencies: {
          mocha: '1.2'
        },
        devDependencies: {
          lodash: '^3.9.3'
        },
        peerDependencies: {
          moment: '^1.0.0'
        },
        optionalDependencies: {
          chalk: '^1.1.0'
        },
        bundleDependencies: {
          bluebird: '^1.0.0'
        }
      }
    })

    it('should return an empty object for an empty package.json and handle default options', () => {
      vm.getCurrentDependencies().should.eql({})
      vm.getCurrentDependencies({}).should.eql({})
      vm.getCurrentDependencies({}, {}).should.eql({})
    })

    it('should get dependencies, devDependencies, and optionalDependencies by default', () => {
      vm.getCurrentDependencies(deps).should.eql({
        mocha: '1.2',
        lodash: '^3.9.3',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
        moment: '^1.0.0'
      })
    })

    it('should only get dependencies with --dep prod', () => {
      vm.getCurrentDependencies(deps, { dep: 'prod' }).should.eql({
        mocha: '1.2'
      })
    })

    it('should only get devDependencies with --dep dev', () => {
      vm.getCurrentDependencies(deps, { dep: 'dev' }).should.eql({
        lodash: '^3.9.3'
      })
    })

    it('should only get optionalDependencies with --dep optional', () => {
      vm.getCurrentDependencies(deps, { dep: 'optional' }).should.eql({
        chalk: '^1.1.0'
      })
    })

    it('should only get peerDependencies with --dep peer', () => {
      vm.getCurrentDependencies(deps, { dep: 'peer' }).should.eql({
        moment: '^1.0.0'
      })
    })

    it('should only get bundleDependencies with --dep bundle', () => {
      vm.getCurrentDependencies(deps, { dep: 'bundle' }).should.eql({
        bluebird: '^1.0.0'
      })
    })

    it('should only get devDependencies and peerDependencies with --dep dev,peer', () => {
      vm.getCurrentDependencies(deps, { dep: 'dev,peer' }).should.eql({
        lodash: '^3.9.3',
        moment: '^1.0.0'
      })
    })

    describe('filter', () => {

      it('should filter dependencies by package name', () => {
        vm.getCurrentDependencies(deps, { filter: 'mocha' }).should.eql({
          mocha: '1.2'
        })
      })

      it('should filter dependencies by @org/package name', () => {
        const deps = {
          dependencies: {
            '@ngrx/store': '4.0.0',
            mocha: '1.0.0'
          }
        }

        vm.getCurrentDependencies(deps, { filter: '@ngrx/store' }).should.eql({
          '@ngrx/store': '4.0.0'
        })
      })

      it('should not filter out dependencies with a partial package name', () => {
        vm.getCurrentDependencies(deps, { filter: 'o' }).should.eql({})
      })

      it('should filter dependencies by multiple packages', () => {
        vm.getCurrentDependencies(deps, { filter: 'mocha lodash' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3'
        })
        vm.getCurrentDependencies(deps, { filter: 'mocha,lodash' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3'
        })
        vm.getCurrentDependencies(deps, { filter: ['mocha', 'lodash'] }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3'
        })
      })

      it('should filter dependencies by regex', () => {
        vm.getCurrentDependencies(deps, { filter: /o/ }).should.eql({
          lodash: '^3.9.3',
          mocha: '1.2',
          moment: '^1.0.0'
        })
        vm.getCurrentDependencies(deps, { filter: '/o/' }).should.eql({
          lodash: '^3.9.3',
          mocha: '1.2',
          moment: '^1.0.0'
        })
      })

      it.skip('should filter org dependencies by regex', () => {
        vm.getCurrentDependencies(deps, { filter: /store/ }).should.eql({
          '@ngrx/store': '4.0.0'
        })
      })
    })

    describe('reject', () => {

      it('should reject dependencies by package name', () => {
        vm.getCurrentDependencies(deps, { reject: 'chalk' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
      })

      it('should not reject dependencies with a partial package name', () => {
        vm.getCurrentDependencies(deps, { reject: 'o' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3',
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
      })

      it('should reject dependencies by multiple packages', () => {
        vm.getCurrentDependencies(deps, { reject: 'mocha lodash' }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
        vm.getCurrentDependencies(deps, { reject: 'mocha,lodash' }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
        vm.getCurrentDependencies(deps, { reject: ['mocha', 'lodash'] }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
      })

      it('should filter dependencies by regex', () => {
        vm.getCurrentDependencies(deps, { reject: /o/ }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0'
        })
        vm.getCurrentDependencies(deps, { reject: '/o/' }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0'
        })
      })

      it('should filter and reject', () => {
        vm.getCurrentDependencies(deps, { filter: 'mocha chalk', reject: 'chalk' }).should.eql({
          mocha: '1.2'
        })
      })
    })

  })

  describe('upgradeDependencies', () => {

    it('should upgrade simple versions', () => {
      vm.upgradeDependencies({ mongodb: '0.5' }, { mongodb: '1.4.30' }).should.eql({ mongodb: '1.4' })
    })

    it('should upgrade latest versions that already satisfy the specified version', () => {
      vm.upgradeDependencies({ mongodb: '^1.0.0' }, { mongodb: '1.4.30' }).should.eql({
        mongodb: '^1.4.30'
      })
    })

    it('should not downgrade', () => {
      vm.upgradeDependencies({ mongodb: '^2.0.7' }, { mongodb: '1.4.30' }).should.eql({})
    })

    it('should use the preferred wildcard when converting <, closed, or mixed ranges', () => {
      vm.upgradeDependencies({ a: '1.*', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
      vm.upgradeDependencies({ a: '1.x', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.x' })
      vm.upgradeDependencies({ a: '~1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '~3.0' })
      vm.upgradeDependencies({ a: '^1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' })

      vm.upgradeDependencies({ a: '1.*', mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
      vm.upgradeDependencies({ mongodb: '1.0 < 2.*' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
    })

    it('should convert closed ranges to caret (^) when preferred wildcard is unknown', () => {
      vm.upgradeDependencies({ mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' })
    })

    it('should ignore packages with empty values', () => {
      vm.upgradeDependencies({ mongodb: null }, { mongodb: '1.4.30' })
        .should.eql({})
      vm.upgradeDependencies({ mongodb: '' }, { mongodb: '1.4.30' })
        .should.eql({})
    })
  })

  describe('getInstalledPackages', function () {
    this.timeout(30000)
    it('should execute npm ls', () => {
      return vm.getInstalledPackages()
        .should.be.fulfilled
    })
  })

  describe('queryVersions', function () {
    // We increase the timeout to allow for more time to retrieve the version information
    this.timeout(30000)

    it('valid single package', () => {
      const latestVersions = vm.queryVersions({ async: '1.5.1' }, { loglevel: 'silent' })
      return latestVersions.should.eventually.have.property('async')
    })

    it('valid packages', () => {
      const latestVersions = vm.queryVersions({ async: '1.5.1', npm: '3.10.3' }, { loglevel: 'silent' })
      latestVersions.should.eventually.have.property('async')
      latestVersions.should.eventually.have.property('npm')
      return latestVersions
    })

    it('unavailable packages should be ignored', () => {
      return vm.queryVersions({ abchdefntofknacuifnt: '1.2.3' }, { loglevel: 'silent' })
        .should.eventually.deep.equal({})
    })

    it('git urls should be ignored', () => {
      return vm.queryVersions({ abchdefntofknacuifnt: 'git+https://mycompany.biz/git/some-private-module' }, { loglevel: 'silent' })
        .should.eventually.deep.equal({})
    })

    it('local file urls should be ignored', () => {
      return vm.queryVersions({ 'eslint-plugin-internal': 'file:devtools/eslint-rules' }, { loglevel: 'silent' })
        .should.eventually.deep.equal({})
    })

    it('set the versionTarget explicitly to latest', () => {
      return vm.queryVersions({ async: '1.5.1' }, { versionTarget: 'latest', loglevel: 'silent' })
        .should.eventually.have.property('async')
    })

    it('set the versionTarget to greatest', () => {
      return vm.queryVersions({ async: '1.5.1' }, { versionTarget: 'greatest', loglevel: 'silent' })
        .should.eventually.have.property('async')
    })

    it('should return an error for an unsupported versionTarget', () => {
      const a = vm.queryVersions({ async: '1.5.1' }, { versionTarget: 'foo', loglevel: 'silent' })
      return a.should.be.rejected
    })

  })

  describe('isUpgradeable', () => {

    it('should not upgrade pure wildcards', () => {
      vm.isUpgradeable('*', '0.5.1').should.equal(false)
    })

    it('should upgrade versions that do not satisfy latest versions', () => {
      vm.isUpgradeable('0.1.x', '0.5.1').should.equal(true)
    })

    it('should not upgrade invalid versions', () => {
      vm.isUpgradeable('https://github.com/strongloop/express', '4.11.2').should.equal(false)
    })

    it('should not upgrade versions beyond the latest', () => {
      vm.isUpgradeable('5.0.0', '4.11.2').should.equal(false)
    })

    it('should handle comparison constraints', () => {
      vm.isUpgradeable('>1.0', '0.5.1').should.equal(false)
      vm.isUpgradeable('<3.0 >0.1', '0.5.1').should.equal(false)
      vm.isUpgradeable('>0.1.x', '0.5.1').should.equal(true)
    })

  })

  describe('getPreferredWildcard', () => {

    it('should identify ^ when it is preferred', () => {
      const deps = {
        async: '^0.9.0',
        bluebird: '^2.9.27',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '^3.2.0'
      }
      vm.getPreferredWildcard(deps).should.equal('^')
    })

    it('should identify ~ when it is preferred', () => {
      const deps = {
        async: '~0.9.0',
        bluebird: '~2.9.27',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '^3.2.0'
      }
      vm.getPreferredWildcard(deps).should.equal('~')
    })

    it('should identify .x when it is preferred', () => {
      const deps = {
        async: '0.9.x',
        bluebird: '2.9.x',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '3.x'
      }
      vm.getPreferredWildcard(deps).should.equal('.x')
    })

    it('should identify .* when it is preferred', () => {
      const deps = {
        async: '0.9.*',
        bluebird: '2.9.*',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '3.*'
      }
      vm.getPreferredWildcard(deps).should.equal('.*')
    })

    it('should not allow wildcards to be outnumbered by non-wildcards', () => {
      const deps = {
        gulp: '^4.0.0',
        typescript: '3.3.0',
        webpack: '4.30.0'
      }
      vm.getPreferredWildcard(deps).should.equal('^')
    })

    it('should use the first wildcard if there is a tie', () => {
      const deps = {
        async: '0.9.x',
        commander: '2.8.*'
      }
      vm.getPreferredWildcard(deps).should.equal('.x')
    })

    it('should return null when it cannot be determined from other dependencies', () => {
      const deps = {
        async: '0.9.0',
        commander: '2.8.1',
        lodash: '3.2.0'
      }
      should.equal(vm.getPreferredWildcard(deps), null)
      should.equal(vm.getPreferredWildcard({}), null)
    })
  })

})
