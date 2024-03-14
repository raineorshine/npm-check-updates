import path from 'path'
import spawn from 'spawn-please'
import ncu from '../src'
import chaiSetup from './helpers/chaiSetup'
import stubNpmView from './helpers/stubNpmView'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('filterVersion', () => {
  describe('module', () => {
    let stub: { restore: () => void }
    before(() => {
      stub = stubNpmView({
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
      })
    })
    after(() => {
      stub.restore()
    })

    it('filter by package version with string', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
        },
      }

      const upgraded = await ncu({
        packageData: pkg,
        filterVersion: '1.0.0',
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.not.have.property('ncu-test-return-version')

      stub.restore()
    })

    it('filter by package version with space-delimited list of strings', async () => {
      const pkg = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-return-version': '1.0.1',
          'fp-and-or': '0.1.0',
        },
      }

      const upgraded = await ncu({
        packageData: pkg,
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

      const upgraded = await ncu({
        packageData: pkg,
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

      const upgraded = await ncu({
        packageData: pkg,
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

      const upgraded = await ncu({
        packageData: pkg,
        filterVersion: '/^1/',
      })

      upgraded!.should.have.property('ncu-test-v2')
      upgraded!.should.have.property('ncu-test-return-version')
      upgraded!.should.not.have.property('fp-and-or')
    })
  })

  describe('cli', () => {
    it('allow multiple --filterVersion options', async () => {
      const stub = stubNpmView('99.9.9', { spawn: true })
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-10': '1.0.9',
        },
      }

      const { stdout } = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--verbose', '--stdin', '--filterVersion', '1.0.0', '--filterVersion', '1.0.9'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-10')
      stub.restore()
    })
  })
})

describe('rejectVersion', () => {
  describe('cli', () => {
    it('allow multiple --rejectVersion options', async () => {
      const stub = stubNpmView('99.9.9', { spawn: true })
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-10': '1.0.9',
        },
      }

      const { stdout } = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--verbose', '--stdin', '--rejectVersion', '1.0.0', '--rejectVersion', '1.0.9'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-10')
      stub.restore()
    })
  })
})
