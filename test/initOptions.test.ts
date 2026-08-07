import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import initOptions from '../src/lib/initOptions.ts'
import { type RunOptions } from '../src/types/RunOptions.ts'

describe('initOptions', () => {
  it('rejects an option value that is not one of its choices', async () => {
    await expect(initOptions({ install: 'sometimes' as any })).rejects.toThrow(
      'Invalid option value: --install sometimes. Valid values are: always, never, prompt.',
    )
  })

  it('rejects a cwd that does not exist', async () => {
    const cwd = path.join(os.tmpdir(), 'ncu-does-not-exist')
    await expect(initOptions({ cwd })).rejects.toThrow(`No such directory: ${cwd}`)
  })

  it('rejects a filter given as both --filter and args', async () => {
    // args is only set by the cli, so it is not part of RunOptions
    const options = { args: ['ncu-test-v2'], filter: 'ncu-test-tag' } as RunOptions
    await expect(initOptions(options)).rejects.toThrow('Cannot specify a filter using both --filter and args.')
  })

  it('rejects --packageFile with --deep', async () => {
    await expect(initOptions({ packageFile: 'package.json', deep: true })).rejects.toThrow(
      'Cannot specify both --packageFile and --deep.',
    )
  })

  it('rejects --format lines with --jsonUpgraded', async () => {
    await expect(initOptions({ format: ['lines'], jsonUpgraded: true })).rejects.toThrow(
      'Cannot specify both --format lines and --jsonUpgraded.',
    )
  })

  it('rejects --format lines with --jsonAll', async () => {
    await expect(initOptions({ format: ['lines'], jsonUpgraded: false, jsonAll: true })).rejects.toThrow(
      'Cannot specify both --format lines and --jsonAll.',
    )
  })

  it('rejects --format lines with another format', async () => {
    await expect(initOptions({ format: ['lines', 'group'], jsonUpgraded: false })).rejects.toThrow(
      'Cannot use --format lines with other formatting options.',
    )
  })

  it('rejects --workspace with --workspaces', async () => {
    await expect(initOptions({ workspace: ['a'], workspaces: true })).rejects.toThrow(
      'Cannot specify both --workspace and --workspaces.',
    )
  })

  it('rejects --deep with --workspaces', async () => {
    await expect(initOptions({ deep: true, workspaces: true })).rejects.toThrow(
      'Cannot specify both --deep and --workspaces.',
    )
  })

  it('rejects --deep with --workspace', async () => {
    await expect(initOptions({ deep: true, workspace: ['a'] })).rejects.toThrow(
      'Cannot specify both --deep and --workspace.',
    )
  })

  it('rejects --doctor with --workspaces', async () => {
    await expect(initOptions({ doctor: true, workspaces: true })).rejects.toThrow(
      'Doctor mode is not currently supported with --workspaces.',
    )
  })

  it('rejects --packageManager staticRegistry without --registry', async () => {
    await expect(initOptions({ packageManager: 'staticRegistry', loglevel: 'silent' })).rejects.toThrow(
      'When --package-manager staticRegistry is specified, you must provide the path for the registry file with --registry.',
    )
  })

  it('warns that --packageManager staticRegistry is deprecated', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(initOptions({ packageManager: 'staticRegistry' })).rejects.toThrow()
    expect(stripAnsi(logSpy.mock.calls.flat().join('\n'))).toContain(
      '--packageManager staticRegistry is deprecated. Use --registryType json.',
    )
    logSpy.mockRestore()
  })

  it('rejects --registryType json without --registry', async () => {
    await expect(initOptions({ registryType: 'json' })).rejects.toThrow(
      'When --registryType json is specified, you must provide the path for the registry file with --registry.',
    )
  })

  it('rejects a --registry that is not a valid URL', async () => {
    await expect(initOptions({ registry: 'not a url' })).rejects.toThrow(
      '--registry must be a valid URL. Invalid value: "not a url"',
    )
  })

  it('accepts a --registry that is a valid URL', async () => {
    const options = await initOptions({ registry: 'https://registry.npmjs.org' })
    expect(options.registry).toBe('https://registry.npmjs.org')
    expect(options.registryType).toBe('npm')
  })

  it('infers registryType json from a .json registry', async () => {
    const options = await initOptions({ registry: 'registry.json' })
    expect(options.registryType).toBe('json')
  })
})
