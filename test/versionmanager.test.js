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

  describe('getInstalledPackages', function () {
    it('execute npm ls', () => {
      return vm.getInstalledPackages()
        .should.be.fulfilled
    })
  })

})
