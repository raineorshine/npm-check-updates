import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import getNcuRc from '../src/lib/getNcuRc.ts'
import removeDir from './helpers/removeDir.ts'

describe('getNcuRc', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-rc-'))
  })

  afterEach(async () => {
    await removeDir(tempDir)
  })

  it('loads a JSON config and flattens it into CLI args', async () => {
    await fs.writeFile(
      path.join(tempDir, '.ncurc.json'),
      JSON.stringify({ upgrade: true, target: 'minor', reject: ['foo'] }),
    )

    const { args, config } = await getNcuRc({ configFilePath: tempDir, options: {} })

    // boolean true -> bare flag, value -> 2-tuple, array -> 2-tuple with the array
    expect(args).toStrictEqual(['--upgrade', '--target', 'minor', '--reject', ['foo']])
    expect(config).toStrictEqual({ upgrade: true, target: 'minor', reject: ['foo'] })
  })

  it('omits boolean options that are false', async () => {
    await fs.writeFile(path.join(tempDir, '.ncurc.json'), JSON.stringify({ upgrade: false, target: 'latest' }))

    const { args } = await getNcuRc({ configFilePath: tempDir, options: {} })

    expect(args).toStrictEqual(['--target', 'latest'])
  })

  it('loads a YAML config', async () => {
    await fs.writeFile(path.join(tempDir, '.ncurc.yaml'), 'upgrade: true\ntarget: patch\n')

    const { args } = await getNcuRc({ configFilePath: tempDir, options: {} })

    expect(args).toStrictEqual(['--upgrade', '--target', 'patch'])
  })

  it('passes unknown options through to args and warns about them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    await fs.writeFile(path.join(tempDir, '.ncurc.json'), JSON.stringify({ notARealOption: 'x' }))

    const { args } = await getNcuRc({ configFilePath: tempDir, options: {} })

    expect(args).toStrictEqual(['--notARealOption', 'x'])
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
    infoSpy.mockRestore()
  })

  it('throws when an explicit config file is not found', async () => {
    await expect(getNcuRc({ configFileName: 'nope.json', configFilePath: tempDir, options: {} })).rejects.toThrow(
      'Config file nope.json not found',
    )
  })
})
