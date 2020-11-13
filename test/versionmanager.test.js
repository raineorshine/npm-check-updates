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

    it('convert < to ^', () => {
      vm.upgradeDependencyDeclaration('<1', '2.1.0').should.equal('^2')
      vm.upgradeDependencyDeclaration('<1.0', '1.1.0').should.equal('^1.1')
    })

    it('preserve > and >=', () => {
      vm.upgradeDependencyDeclaration('>1.0', '2.0.0').should.equal('>2.0')
      vm.upgradeDependencyDeclaration('>=1.0', '2.0.0').should.equal('>=2.0')
    })

    it('preserve ^ and ~', () => {
      vm.upgradeDependencyDeclaration('^1.2.3', '1.2.4').should.equal('^1.2.4')
      vm.upgradeDependencyDeclaration('~1.2.3', '1.2.4').should.equal('~1.2.4')
    })

    it('preserve prerelease versons', () => {
      vm.upgradeDependencyDeclaration('^0.15.7', '0.16.0-beta.3').should.equal('^0.16.0-beta.3')
    })

    it('replace multiple ranges with ^', () => {
      vm.upgradeDependencyDeclaration('>1.0 >2.0 < 3.0', '3.1.0').should.equal('^3.1')
    })

    it('handle ||', () => {
      vm.upgradeDependencyDeclaration('~1.0 || ~1.2', '3.1.0').should.equal('~3.1')
    })

    it('hyphen (-) range', () => {
      vm.upgradeDependencyDeclaration('1.0 - 2.0', '3.1.0').should.equal('3.1')
    })

    it('use the range with the fewest parts if there are multiple ranges', () => {
      vm.upgradeDependencyDeclaration('1.1 || 1.2.0', '3.1.0').should.equal('3.1')
      vm.upgradeDependencyDeclaration('1.2.0 || 1.1', '3.1.0').should.equal('3.1')
    })

    it('preserve wildcards in comparisons', () => {
      vm.upgradeDependencyDeclaration('1.x < 1.2.0', '3.1.0').should.equal('3.x')
    })

    it('use the first operator if a comparison has mixed operators', () => {
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

    it('remove semver range if removeRange option is specified', () => {
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

    it('upgrade the dependencies in the given package data (including satisfied)', async () => {
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

    it('upgrade the dependencies in the given package data (except for satisfied)', async () => {
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

    it('upgrade npm aliases', async () => {

      const oldDependencies = { foo: 'ncu-test-v2@^1.0.0' }
      const newDependencies = { foo: 'ncu-test-v2@^2.0.0' }
      const newVersions = { foo: 'ncu-test-v2@2.0.0' }
      const oldPkgData = JSON.stringify({ dependencies: oldDependencies })

      const { newPkgData } = await vm.upgradePackageData(oldPkgData, oldDependencies, newDependencies, newVersions)

      JSON.parse(newPkgData)
        .should.eql({
          dependencies: {
            foo: 'ncu-test-v2@^2.0.0'
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

    it('return an empty object for an empty package.json and handle default options', () => {
      vm.getCurrentDependencies().should.eql({})
      vm.getCurrentDependencies({}).should.eql({})
      vm.getCurrentDependencies({}, {}).should.eql({})
    })

    it('get dependencies, devDependencies, and optionalDependencies by default', () => {
      vm.getCurrentDependencies(deps).should.eql({
        mocha: '1.2',
        lodash: '^3.9.3',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
        moment: '^1.0.0'
      })
    })

    it('only get dependencies with --dep prod', () => {
      vm.getCurrentDependencies(deps, { dep: 'prod' }).should.eql({
        mocha: '1.2'
      })
    })

    it('only get devDependencies with --dep dev', () => {
      vm.getCurrentDependencies(deps, { dep: 'dev' }).should.eql({
        lodash: '^3.9.3'
      })
    })

    it('only get optionalDependencies with --dep optional', () => {
      vm.getCurrentDependencies(deps, { dep: 'optional' }).should.eql({
        chalk: '^1.1.0'
      })
    })

    it('only get peerDependencies with --dep peer', () => {
      vm.getCurrentDependencies(deps, { dep: 'peer' }).should.eql({
        moment: '^1.0.0'
      })
    })

    it('only get bundleDependencies with --dep bundle', () => {
      vm.getCurrentDependencies(deps, { dep: 'bundle' }).should.eql({
        bluebird: '^1.0.0'
      })
    })

    it('only get devDependencies and peerDependencies with --dep dev,peer', () => {
      vm.getCurrentDependencies(deps, { dep: 'dev,peer' }).should.eql({
        lodash: '^3.9.3',
        moment: '^1.0.0'
      })
    })

    describe('filter', () => {

      it('filter dependencies by package name', () => {
        vm.getCurrentDependencies(deps, { filter: 'mocha' }).should.eql({
          mocha: '1.2'
        })
      })

      it('filter dependencies by @org/package name', () => {
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

      it('do not filter out dependencies with a partial package name', () => {
        vm.getCurrentDependencies(deps, { filter: 'o' }).should.eql({})
      })

      it('filter dependencies by multiple packages', () => {
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

      it('filter dependencies by regex', () => {
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

      it('reject dependencies by package name', () => {
        vm.getCurrentDependencies(deps, { reject: 'chalk' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
      })

      it('do not reject dependencies with a partial package name', () => {
        vm.getCurrentDependencies(deps, { reject: 'o' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3',
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
          moment: '^1.0.0'
        })
      })

      it('reject dependencies by multiple packages', () => {
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

      it('filter dependencies by regex', () => {
        vm.getCurrentDependencies(deps, { reject: /o/ }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0'
        })
        vm.getCurrentDependencies(deps, { reject: '/o/' }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0'
        })
      })

      it('filter and reject', () => {
        vm.getCurrentDependencies(deps, { filter: 'mocha chalk', reject: 'chalk' }).should.eql({
          mocha: '1.2'
        })
      })
    })

  })

  describe('upgradeDependencies', () => {

    it('upgrade simple, non-semver versions', () => {
      vm.upgradeDependencies({ mongodb: '0.5' }, { mongodb: '1.4.30' }).should.eql({ mongodb: '1.4' })
      vm.upgradeDependencies({ 'ncu-test-simple-tag': 'v1' }, { 'ncu-test-simple-tag': 'v3' }).should.eql({ 'ncu-test-simple-tag': 'v3' })
    })

    it('upgrade latest versions that already satisfy the specified version', () => {
      vm.upgradeDependencies({ mongodb: '^1.0.0' }, { mongodb: '1.4.30' }).should.eql({
        mongodb: '^1.4.30'
      })
    })

    it('do not downgrade', () => {
      vm.upgradeDependencies({ mongodb: '^2.0.7' }, { mongodb: '1.4.30' }).should.eql({})
    })

    it('use the preferred wildcard when converting <, closed, or mixed ranges', () => {
      vm.upgradeDependencies({ a: '1.*', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
      vm.upgradeDependencies({ a: '1.x', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.x' })
      vm.upgradeDependencies({ a: '~1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '~3.0' })
      vm.upgradeDependencies({ a: '^1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' })

      vm.upgradeDependencies({ a: '1.*', mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
      vm.upgradeDependencies({ mongodb: '1.0 < 2.*' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
    })

    it('convert closed ranges to caret (^) when preferred wildcard is unknown', () => {
      vm.upgradeDependencies({ mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' })
    })

    it('ignore packages with empty values', () => {
      vm.upgradeDependencies({ mongodb: null }, { mongodb: '1.4.30' })
        .should.eql({})
      vm.upgradeDependencies({ mongodb: '' }, { mongodb: '1.4.30' })
        .should.eql({})
    })

  })

  describe('getInstalledPackages', function () {
    this.timeout(30000)
    it('execute npm ls', () => {
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

    it('local file urls should be ignored', () => {
      return vm.queryVersions({ 'eslint-plugin-internal': 'file:devtools/eslint-rules' }, { loglevel: 'silent' })
        .should.eventually.deep.equal({})
    })

    it('set the target explicitly to latest', () => {
      return vm.queryVersions({ async: '1.5.1' }, { target: 'latest', loglevel: 'silent' })
        .should.eventually.have.property('async')
    })

    it('set the target to greatest', () => {
      return vm.queryVersions({ async: '1.5.1' }, { target: 'greatest', loglevel: 'silent' })
        .should.eventually.have.property('async')
    })

    it('return an error for an unsupported target', () => {
      const a = vm.queryVersions({ async: '1.5.1' }, { target: 'foo', loglevel: 'silent' })
      return a.should.be.rejected
    })

    it('npm aliases should upgrade the installed package', () => {
      return vm.queryVersions({
        request: 'npm:ncu-test-v2@1.0.0'
      }, { loglevel: 'silent' })
        .should.eventually.deep.equal({
          request: 'npm:ncu-test-v2@2.0.0'
        })
    })

    describe('github urls', () => {

      it('github urls should upgrade the embedded semver tag', async () => {
        const upgrades = await vm.queryVersions({
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#v1.0.0'
        }, { loglevel: 'silent' })

        upgrades.should.deep.equal({
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#v2.0.0'
        })
      })

      it('git+https urls should upgrade the embedded semver tag', async () => {
        const upgrades = await vm.queryVersions({
          'ncu-test-v2': 'git+https://github.com/raineorshine/ncu-test-v2#v1.0.0'
        }, { loglevel: 'silent' })

        upgrades.should.deep.equal({
          'ncu-test-v2': 'git+https://github.com/raineorshine/ncu-test-v2#v2.0.0'
        })
      })

      it('ignore tags that are not valid semver', async () => {

        // this repo has tag "1.0" which is not valid semver
        const upgrades1 = await vm.queryVersions({
          'ncu-test-invalid-tag': 'raineorshine/ncu-test-invalid-tag.git#v3.0.0'
        }, { loglevel: 'silent' })

        upgrades1.should.deep.equal({
          'ncu-test-invalid-tag': 'raineorshine/ncu-test-invalid-tag.git#v3.0.5'
        })

        // this repo has tag "v0.1.3a" which is not valid semver
        const upgrades2 = await vm.queryVersions({
          'angular-toasty': 'git+https://github.com/raineorshine/ncu-test-v0.1.3a.git#1.0.0'
        }, { loglevel: 'silent' })

        upgrades2.should.deep.equal({
          'angular-toasty': 'git+https://github.com/raineorshine/ncu-test-v0.1.3a.git#1.0.7'
        })

      })

      it('support simple, non-semver tags in the format "v1"', async () => {
        const upgrades = await vm.queryVersions({
          // this repo has tag "1.0" which is not valid semver
          'ncu-test-invalid-tag': 'git+https://github.com/raineorshine/ncu-test-simple-tag#v1'
        }, { loglevel: 'silent' })

        upgrades.should.deep.equal({
          'ncu-test-invalid-tag': 'git+https://github.com/raineorshine/ncu-test-simple-tag#v3'
        })
      })

      it('ignore repos with no tags', async () => {
        const upgrades = await vm.queryVersions({
          // this repo has tag "1.0" which is not valid semver
          'ncu-test-invalid-tag': 'git+https://github.com/raineorshine/ncu-test-no-tags#v1'
        }, { loglevel: 'silent' })
        upgrades.should.deep.equal({})
      })

      it('valid but non-existent github urls with tags should be ignored', async () => {
        const upgrades = await vm.queryVersions({
          'ncu-test-alpha': 'git+https://username:dh9dnas0nndnjnjasd4@bitbucket.org/somename/common.git#v283',
          'ncu-test-private': 'https://github.com/ncu-test/ncu-test-private#v999.9.9',
          'ncu-return-version': 'git+https://raineorshine@github.com/ncu-return-version#v999.9.9',
          'ncu-test-v2': '^1.0.0'
        }, { loglevel: 'silent' })

        upgrades.should.deep.equal({
          'ncu-test-v2': '2.0.0',
        })
      })

    })

  })

  describe('isUpgradeable', () => {

    it('do not upgrade pure wildcards', () => {
      vm.isUpgradeable('*', '0.5.1').should.equal(false)
    })

    it('upgrade versions that do not satisfy latest versions', () => {
      vm.isUpgradeable('0.1.x', '0.5.1').should.equal(true)
    })

    it('do not upgrade invalid versions', () => {
      vm.isUpgradeable('https://github.com/strongloop/express', '4.11.2').should.equal(false)
    })

    it('do not upgrade versions beyond the latest', () => {
      vm.isUpgradeable('5.0.0', '4.11.2').should.equal(false)
    })

    it('handle comparison constraints', () => {
      vm.isUpgradeable('>1.0', '0.5.1').should.equal(false)
      vm.isUpgradeable('<3.0 >0.1', '0.5.1').should.equal(false)
      vm.isUpgradeable('>0.1.x', '0.5.1').should.equal(true)
      vm.isUpgradeable('<7.0.0', '7.2.0').should.equal(true)
      vm.isUpgradeable('<7.0', '7.2.0').should.equal(true)
      vm.isUpgradeable('<7', '7.2.0').should.equal(true)
    })

    it('upgrade simple versions', () => {
      vm.isUpgradeable('v1', 'v2').should.equal(true)
    })

  })

  describe('getPreferredWildcard', () => {

    it('identify ^ when it is preferred', () => {
      const deps = {
        async: '^0.9.0',
        bluebird: '^2.9.27',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '^3.2.0'
      }
      vm.getPreferredWildcard(deps).should.equal('^')
    })

    it('identify ~ when it is preferred', () => {
      const deps = {
        async: '~0.9.0',
        bluebird: '~2.9.27',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '^3.2.0'
      }
      vm.getPreferredWildcard(deps).should.equal('~')
    })

    it('identify .x when it is preferred', () => {
      const deps = {
        async: '0.9.x',
        bluebird: '2.9.x',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '3.x'
      }
      vm.getPreferredWildcard(deps).should.equal('.x')
    })

    it('identify .* when it is preferred', () => {
      const deps = {
        async: '0.9.*',
        bluebird: '2.9.*',
        cint: '^8.2.1',
        commander: '~2.8.1',
        lodash: '3.*'
      }
      vm.getPreferredWildcard(deps).should.equal('.*')
    })

    it('do not allow wildcards to be outnumbered by non-wildcards', () => {
      const deps = {
        gulp: '^4.0.0',
        typescript: '3.3.0',
        webpack: '4.30.0'
      }
      vm.getPreferredWildcard(deps).should.equal('^')
    })

    it('use the first wildcard if there is a tie', () => {
      const deps = {
        async: '0.9.x',
        commander: '2.8.*'
      }
      vm.getPreferredWildcard(deps).should.equal('.x')
    })

    it('return null when it cannot be determined from other dependencies', () => {
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
