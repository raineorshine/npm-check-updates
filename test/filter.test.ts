import fs from 'fs/promises'
import path from 'path'
import spawn from 'spawn-please'
import ncu from '../src'
import { Index } from '../src/types/IndexType'
import chaiSetup from './helpers/chaiSetup'
import stubNpmView from './helpers/stubNpmView'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('filter', () => {
  describe('module', () => {
    let stub: { restore: () => void }
    before(() => (stub = stubNpmView('99.9.9')))
    after(() => stub.restore())

    it('filter by package name with one arg', async () => {
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ['lodash.map'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.not.have.property('lodash.filter')
    })

    it('filter by package name with multiple args', async () => {
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ['lodash.map', 'lodash.filter'],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
    })

    it('filter with wildcard', async () => {
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
    })

    it('filter with wildcard for scoped package', async () => {
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
    })

    it('filter with negated wildcard', async () => {
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
    })

    it('filter with regex string', async () => {
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
    })

    it('filter with array of strings', async () => {
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
    })

    it('filter with array of regex', async () => {
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
    })

    it('filter with array of mixed strings and regex', async () => {
      const upgraded = (await ncu({
        packageData: {
          dependencies: {
            'fp-and-or': '0.1.0',
            lodash: '2.0.0',
            'lodash.map': '2.0.0',
            'lodash.filter': '2.0.0',
          },
        },
        filter: ['fp-and-or', /lodash\..*/],
      })) as Index<string>
      upgraded.should.deep.equal({
        'fp-and-or': '99.9.9',
        'lodash.map': '99.9.9',
        'lodash.filter': '99.9.9',
      })
    })

    it('filter with array of regex strings', async () => {
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
    })

    it('trim and ignore empty filter', async () => {
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: [],
      })) as Index<string>
      upgraded.should.have.property('lodash.map')
      upgraded.should.have.property('lodash.filter')
    })
  })

  describe('cli', () => {
    let stub: { restore: () => void }
    before(() => (stub = stubNpmView('99.9.9', { spawn: true })))
    after(() => stub.restore())

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

    it('allow multiple --filter options', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }

      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'ncu-test-v2', '--filter', 'ncu-test-tag'],
        JSON.stringify(pkgData),
      )
      const upgraded = JSON.parse(output)
      upgraded.should.have.property('ncu-test-v2')
      upgraded.should.have.property('ncu-test-tag')
    })
  })
})

describe('reject', () => {
  describe('cli', () => {
    let stub: { restore: () => void }
    before(() => (stub = stubNpmView('99.9.9', { spawn: true })))
    after(() => stub.restore())

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

    it('allow multiple --reject options', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }

      const output = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--reject', 'ncu-test-v2', '--reject', 'ncu-test-tag'],
        JSON.stringify(pkgData),
      )
      const upgraded = JSON.parse(output)
      upgraded.should.not.have.property('ncu-test-v2')
      upgraded.should.not.have.property('ncu-test-tag')
    })
  })
})
