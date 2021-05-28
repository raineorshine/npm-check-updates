const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const vm = require('../src/versionmanager')

const should = chai.should()

chai.use(chaiAsPromised)

describe('versionmanager', () => {

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

    it('get dependencies, devDependencies, bundleDegendencies, and optionalDependencies by default', () => {
      vm.getCurrentDependencies(deps).should.eql({
        mocha: '1.2',
        lodash: '^3.9.3',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
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
        })
        vm.getCurrentDependencies(deps, { filter: '/o/' }).should.eql({
          lodash: '^3.9.3',
          mocha: '1.2',
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
        })
      })

      it('do not reject dependencies with a partial package name', () => {
        vm.getCurrentDependencies(deps, { reject: 'o' }).should.eql({
          mocha: '1.2',
          lodash: '^3.9.3',
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
        })
      })

      it('reject dependencies by multiple packages', () => {
        vm.getCurrentDependencies(deps, { reject: 'mocha lodash' }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
        })
        vm.getCurrentDependencies(deps, { reject: 'mocha,lodash' }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
        })
        vm.getCurrentDependencies(deps, { reject: ['mocha', 'lodash'] }).should.eql({
          chalk: '^1.1.0',
          bluebird: '^1.0.0',
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
      vm.upgradeDependencies({ foo: '1' }, { foo: '2' }).should.eql({ foo: '2' })
      vm.upgradeDependencies({ foo: '1.0' }, { foo: '1.1' }).should.eql({ foo: '1.1' })
      vm.upgradeDependencies({ 'ncu-test-simple-tag': 'v1' }, { 'ncu-test-simple-tag': 'v3' }).should.eql({ 'ncu-test-simple-tag': 'v3' })
    })

    it('upgrade github dependencies', () => {
      vm.upgradeDependencies({ foo: 'github:foo/bar#v1' }, { foo: 'github:foo/bar#v2' }).should.eql({ foo: 'github:foo/bar#v2' })
      vm.upgradeDependencies({ foo: 'github:foo/bar#v1.0' }, { foo: 'github:foo/bar#v2.0' }).should.eql({ foo: 'github:foo/bar#v2.0' })
      vm.upgradeDependencies({ foo: 'github:foo/bar#v1.0.0' }, { foo: 'github:foo/bar#v2.0.0' }).should.eql({ foo: 'github:foo/bar#v2.0.0' })
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

  describe('getIgnoredUpgrades', function () {
    it('ncu-test-peer-update', async () => {
      const data = await vm.getIgnoredUpgrades({
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
      }, {
        'ncu-test-return-version': '1.1.0',
        'ncu-test-peer': '1.1.0',
      }, {
        'ncu-test-peer': {
          'ncu-test-return-version': '1.1.x'
        }
      }, {})
      data.should.deep.equal({
        'ncu-test-return-version': {
          from: '1.0.0',
          to: '2.0.0',
          reason: {
            'ncu-test-peer': '1.1.x'
          }
        }
      })
    })
  })

  describe('getPeerDependenciesFromRegistry', function () {
    it('single package', async () => {
      const data = await vm.getPeerDependenciesFromRegistry({ 'ncu-test-peer': '1.0' }, {})
      data.should.deep.equal({
        'ncu-test-peer': {
          'ncu-test-return-version': '1.x'
        }
      })
    })
    it('single package empty', async () => {
      const data = await vm.getPeerDependenciesFromRegistry({ 'ncu-test-return-version': '1.0' }, {})
      data.should.deep.equal({ 'ncu-test-return-version': {} })
    })
    it('multiple packages', async () => {
      const data = await vm.getPeerDependenciesFromRegistry({
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
      }, {})
      data.should.deep.equal({
        'ncu-test-return-version': {},
        'ncu-test-peer': {
          'ncu-test-return-version': '1.x'
        }
      })
    })
  })

})
