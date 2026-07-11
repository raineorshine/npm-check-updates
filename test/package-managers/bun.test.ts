import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as bun from '../../src/package-managers/bun.ts'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('spawn-please', () => ({ default: spawnMock }))

describe('bun', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  describe('list', () => {
    it('parses bun pm ls output, including namespaced packages', async () => {
      spawnMock.mockResolvedValue({
        stdout: `myapp@1.0.0 node_modules (3)
├── chalk@5.3.0
├── @angular/cli@17.0.0
└── react@18.2.0`,
        stderr: '',
      })

      const result = await bun.list({})

      expect(result).toEqual({
        chalk: '5.3.0',
        '@angular/cli': '17.0.0',
        react: '18.2.0',
      })
    })
  })

  describe('defaultPrefix', () => {
    const originalBunInstall = process.env.BUN_INSTALL

    afterEach(() => {
      if (originalBunInstall === undefined) {
        delete process.env.BUN_INSTALL
      } else {
        process.env.BUN_INSTALL = originalBunInstall
      }
    })

    it('returns undefined when not global', async () => {
      expect(await bun.defaultPrefix({})).toBeUndefined()
    })

    it('returns options.prefix when global', async () => {
      expect(await bun.defaultPrefix({ global: true, prefix: '/custom' })).toBe('/custom')
    })

    it('uses the BUN_INSTALL env var when global with no prefix', async () => {
      process.env.BUN_INSTALL = '/env/bun'
      expect(await bun.defaultPrefix({ global: true })).toBe('/env/bun')
    })

    it('falls back to the bun global bin directory when global with no prefix or BUN_INSTALL', async () => {
      delete process.env.BUN_INSTALL
      spawnMock.mockResolvedValue({ stdout: '/usr/local/bin', stderr: '' })
      expect(await bun.defaultPrefix({ global: true })).toBe(path.dirname('/usr/local/bin'))
    })
  })
})
