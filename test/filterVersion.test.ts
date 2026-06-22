import ncu from '../src'
import { runNcuCli } from './helpers/runNcuCli'
import stubVersions from './helpers/stubVersions'

describe('filterVersion', () => {
  describe('module', () => {
    let stub: { mockRestore: () => void }
    beforeEach(() => {
      stub = stubVersions({
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        'fp-and-or': '1.0.2',
      })
    })
    afterEach(() => {
      stub.mockRestore()
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
      const stub = stubVersions('99.9.9', { spawn: true })
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-10': '1.0.9',
        },
      }

      const { stdout } = await runNcuCli(
        ['--jsonUpgraded', '--verbose', '--stdin', '--filterVersion', '1.0.0', '--filterVersion', '1.0.9'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-10')
      stub.mockRestore()
    })
  })
})

describe('rejectVersion', () => {
  describe('cli', () => {
    it('allow multiple --rejectVersion options', async () => {
      const stub = stubVersions('99.9.9', { spawn: true })
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
          'ncu-test-10': '1.0.9',
        },
      }

      const { stdout } = await runNcuCli(
        ['--jsonUpgraded', '--verbose', '--stdin', '--rejectVersion', '1.0.0', '--rejectVersion', '1.0.9'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-10')
      stub.mockRestore()
    })
  })
})
