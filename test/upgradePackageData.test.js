const upgradePackageData = require('../src/lib/upgradePackageData').default

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
    const { newPkgData } = await upgradePackageData(pkgData, oldDependencies, newDependencies, newVersions)
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
    const { newPkgData } = await upgradePackageData(pkgData, oldDependencies, newDependencies, newVersions, { minimal: true })
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

    const { newPkgData } = await upgradePackageData(oldPkgData, oldDependencies, newDependencies, newVersions)

    JSON.parse(newPkgData)
      .should.eql({
        dependencies: {
          foo: 'ncu-test-v2@^2.0.0'
        }
      })
  })
})
