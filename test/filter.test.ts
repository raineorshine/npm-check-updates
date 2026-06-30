import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'spawn-please'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import { type Index } from '../src/types/IndexType.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')

describe('filter', () => {
  describe('module', () => {
    let stub: { restore: () => void }
    beforeAll(() => (stub = stubVersions('99.9.9')))
    afterAll(() => stub.restore())

    it('filter by package name with one arg', async () => {
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ['lodash.map'],
      })) as Index<string>
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).not.toHaveProperty('lodash.filter')
    })

    it('filter by package name with multiple args', async () => {
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ['lodash.map', 'lodash.filter'],
      })) as Index<string>
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
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
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
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
        expect(upgraded).toHaveProperty('vite')
        expect(upgraded).not.toHaveProperty('@vitejs/plugin-react')
        expect(upgraded).not.toHaveProperty('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['@vite*'] })
        expect(upgraded).not.toHaveProperty('vite')
        expect(upgraded).toHaveProperty('@vitejs/plugin-react')
        expect(upgraded).toHaveProperty('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['*vite*'] })
        expect(upgraded).toHaveProperty('vite')
        expect(upgraded).toHaveProperty('@vitejs/plugin-react')
        expect(upgraded).toHaveProperty('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['*vite*/*react*'] })
        expect(upgraded).not.toHaveProperty('vite')
        expect(upgraded).toHaveProperty('@vitejs/plugin-react')
        expect(upgraded).not.toHaveProperty('@vitejs/plugin-vue')
      }

      {
        const upgraded = await ncu({ packageData: pkg, filter: ['*vite*vue*'] })
        expect(upgraded).not.toHaveProperty('vite')
        expect(upgraded).not.toHaveProperty('@vitejs/plugin-react')
        expect(upgraded).toHaveProperty('@vitejs/plugin-vue')
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
      expect(upgraded).toHaveProperty('lodash')
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
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
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
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
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
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
      expect(upgraded).toHaveProperty('fp-and-or')
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
      expect(upgraded).toStrictEqual({
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
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
      expect(upgraded).toHaveProperty('fp-and-or')
    })

    it('trim and ignore empty array', async () => {
      const upgraded = (await ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: [],
      })) as Index<string>
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
    })

    it('empty string is invalid', async () => {
      const promise = ncu({
        packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
        filter: ',test',
      })
      await expect(promise).rejects.toThrow('Invalid filter: Expected pattern to be a non-empty string')
    })
  })

  describe('cli', () => {
    let stub: { restore: () => void }
    beforeAll(() => (stub = stubVersions('99.9.9', { spawn: true })))
    afterAll(() => stub.restore())

    it('filter by package name with --filter', async () => {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin', '--filter', 'express'], {
        stdin: '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      })
      const pkgData = JSON.parse(stdout)
      expect(pkgData).toHaveProperty('express')
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('filter by package name with -f', async () => {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin', '-f', 'express'], {
        stdin: '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      })
      const pkgData = JSON.parse(stdout)
      expect(pkgData).toHaveProperty('express')
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('do not allow non-matching --filter and arguments', async () => {
      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      }

      await expect(
        spawn('node', [bin, '--jsonUpgraded', '--filter', 'lodash.map', 'lodash.filter'], {
          stdin: JSON.stringify(pkgData),
        }),
      ).rejects.toThrow()
    })

    it('allow matching --filter and arguments', async () => {
      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      }

      const { stdout } = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'lodash.map lodash.filter', 'lodash.map', 'lodash.filter'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
    })

    it('trim and ignore empty args', async () => {
      const pkgData = {
        dependencies: {
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      }

      const { stdout } = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'lodash.map lodash.filter', ' '],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      expect(upgraded).toHaveProperty('lodash.map')
      expect(upgraded).toHaveProperty('lodash.filter')
    })

    it('allow multiple --filter options', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }

      const { stdout } = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--filter', 'ncu-test-v2', '--filter', 'ncu-test-tag'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      expect(upgraded).toHaveProperty('ncu-test-v2')
      expect(upgraded).toHaveProperty('ncu-test-tag')
    })
  })
})

describe('reject', () => {
  describe('cli', () => {
    let stub: { restore: () => void }
    beforeAll(() => (stub = stubVersions('99.9.9', { spawn: true })))
    afterAll(() => stub.restore())

    it('reject by package name with --reject', async () => {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin', '--reject', 'chalk'], {
        stdin: '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      })
      const pkgData = JSON.parse(stdout)
      expect(pkgData).toHaveProperty('express')
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('reject by package name with -x', async () => {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--stdin', '-x', 'chalk'], {
        stdin: '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }',
      })
      const pkgData = JSON.parse(stdout)
      expect(pkgData).toHaveProperty('express')
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('reject with empty string should not reject anything', async () => {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--reject', '""', '--stdin', '-x', 'chalk'], {
        stdin: '{ "dependencies": { "ncu-test-v2": "1.0.0", "ncu-test-tag": "1.0.0" } }',
      })
      const pkgData = JSON.parse(stdout)
      expect(pkgData).toHaveProperty('ncu-test-v2')
      expect(pkgData).toHaveProperty('ncu-test-tag')
    })

    it('allow multiple --reject options', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '^1.0.0',
        },
      }

      const { stdout } = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--stdin', '--reject', 'ncu-test-v2', '--reject', 'ncu-test-tag'],
        { stdin: JSON.stringify(pkgData) },
      )
      const upgraded = JSON.parse(stdout)
      expect(upgraded).not.toHaveProperty('ncu-test-v2')
      expect(upgraded).not.toHaveProperty('ncu-test-tag')
    })
  })
})
