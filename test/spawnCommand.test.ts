import { describe, expect, it } from 'vitest'
import { getSpawnCommands } from '../src/lib/spawnCommand.ts'

describe('spawnCommand', () => {
  it('prefers cmd shims on Windows and falls back to extensionless commands', () => {
    expect(getSpawnCommands('pnpm', 'win32')).toStrictEqual(['pnpm.cmd', 'pnpm'])
  })

  it('does not use cmd shims on non-Windows platforms', () => {
    expect(getSpawnCommands('pnpm', 'linux')).toStrictEqual(['pnpm'])
  })

  it('does not use cmd shims for bun on Windows', () => {
    expect(getSpawnCommands('bun', 'win32')).toStrictEqual(['bun'])
  })
})
