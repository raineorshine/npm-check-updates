import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import fs from 'fs/promises'
import path from 'path'
import spawn from 'spawn-please'
import ncu from '../src'
import { Index } from '../src/types/IndexType'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiAsPromised)
process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('filter', () => {
  describe('module', () => {
    it('filter by package name with one arg', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ['lodash.map'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.not.have.property('lodash.filter')
      stub.restore()
    })

    it('filter by package name with multiple args', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ['lodash.map', 'lodash.filter'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      stub.restore()
    })

    it('filter with wildcard', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: ['lodash.*'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      stub.restore()
    })

    it('filter with wildcard for scoped package', async () => {
      const stub = stubNpmView('99.9.9')
      const pkg = {
        dependencies: {
          vite: '1.0.0',
          '@vitejs/plugin-react': '1.0.0',
          '@vitejs/plugin-vue': '1.0.0',
        },
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['vite'] })
        upgraded!.should.have.property('vite')
        upgraded!.should.not.have.property('@vitejs/plugin-react')
        upgraded!.should.not.have.property('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['@vite*'] })
        upgraded!.should.not.have.property('vite')
        upgraded!.should.have.property('@vitejs/plugin-react')
        upgraded!.should.have.property('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['*vite*'] })
        upgraded!.should.have.property('vite')
        upgraded!.should.have.property('@vitejs/plugin-react')
        upgraded!.should.have.property('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['*vite*/*react*'] })
        upgraded!.should.not.have.property('vite')
        upgraded!.should.have.property('@vitejs/plugin-react')
        upgraded!.should.not.have.property('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['*vite*vue*'] })
        upgraded!.should.not.have.property('vite')
        upgraded!.should.not.have.property('@vitejs/plugin-react')
        upgraded!.should.have.property('@vitejs/plugin-vue')
      }

      stub.restore()
    })

    it('filter with negated wildcard', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: ['!lodash.*'],
      })) as Index<string>
      upgraded.should.have.property('lodash')
      stub.restore()
    })

    it('filter with regex string', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: '/lodash\\..*/',
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      stub.restore()
    })

    it('filter with array of strings', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: ['lodash.map', 'lodash.filter'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      stub.restore()
    })

    it('filter with array of regex', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            'fp-and-or': '0.1.0',
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: [/lodash\..*/, /fp.*/],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      upgraded.should.have.property('fp-and-or')
      stub.restore()
    })

    it('filter with array of regex strings', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            'fp-and-or': '0.1.0',
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: ['/lodash\\..*/', '/fp.*/'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      upgraded.should.have.property('fp-and-or')
      stub.restore()
    })

    it('trim and ignore empty filter', async () => {
      const stub = stubNpmView('99.9.9')
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: [],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
      stub.restore()
    })
  })

  describe('cli', () => {
    it('filter by package name with --filter', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'express'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    })

    it('filter by package name with -f', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '-f', 'express'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    })

    it('do not allow non-matching --filter and arguments', async () => {
      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      }

      await spawn('node', [bin, '--jsonUpgraded', '--filter', 'lodash.map', 'lodash.filter'], JSON.stringify(pkgData))
        .should.eventually.be.rejected
    })

    it('allow matching --filter and arguments', async () => {
      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      }

      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'lodash.map lodash.filter', 'lodash.map', 'lodash.filter'],
        JSON.stringify(pkgData),
      )
      const upgraded = JSON.parse(output)
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
    })

    it('trim and ignore empty args', async () => {
      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      }

      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'lodash.map lodash.filter', ' '],
        JSON.stringify(pkgData),
      )
      const upgraded = JSON.parse(output)
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
    })
  })
})

describe('reject', () => {
  describe('cli', () => {
    it('reject by package name with --reject', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--reject', 'chalk'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    })

    it('reject by package name with -x', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '-x', 'chalk'],
        '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('express')
      pkgData.should.not.have.property('chalk')
    })

    it('reject with empty string should not reject anything', async () => {
      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--reject', '""', '--stdin', '-x', 'chalk'],
        '{ "dependencies": { "ncu-test-v2": "1.0.0", "ncu-test-tag": "1.0.0" } }',
      )
      const pkgData = JSON.parse(output)
      pkgData.should.have.property('ncu-test-v2')
      pkgData.should.have.property('ncu-test-tag')
    })
  })
})
