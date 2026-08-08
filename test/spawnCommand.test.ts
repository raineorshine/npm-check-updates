import { describe, expect, it } from 'vitest'
import spawnCommand, { getSpawnCommands } from '../src/lib/spawnCommand.ts'

/** Runs an inline node script, so no package manager needs to be installed. */
const node = (script: string, spawnPleaseOptions?: Parameters<typeof spawnCommand>[2]) =>
  spawnCommand('node', ['-e', script], spawnPleaseOptions)

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

  it('resolves with stdout and the command that ran', async () => {
    const { stdout, command } = await node('process.stdout.write("hi")')
    expect(stdout).toBe('hi')
    expect(command).toContain('node')
  })

  it('rejects with ENOENT when the command does not exist, even with rejectOnError false', async () => {
    await expect(spawnCommand('ncu-nonexistent-command', [], { rejectOnError: false })).rejects.toThrow(/ENOENT/)
  })

  it('rejects on a non-zero exit by default', async () => {
    await expect(node('process.stderr.write("boom"); process.exit(1)')).rejects.toBeDefined()
  })

  it('resolves with the output on a non-zero exit when rejectOnError is false', async () => {
    const { stdout, stderr } = await node('process.stdout.write("out"); process.stderr.write("err"); process.exit(1)', {
      rejectOnError: false,
    })
    expect(stdout).toBe('out')
    expect(stderr).toBe('err')
  })

  // not an exact match, since a discarded .cmd probe on Windows also writes to the callbacks
  it('still calls the caller stdout and stderr callbacks', async () => {
    let out = ''
    let err = ''
    await node('process.stdout.write("a"); process.stderr.write("b")', {
      stdout: (data: string) => {
        out += data
      },
      stderr: (data: string) => {
        err += data
      },
    })
    expect(out).toContain('a')
    expect(err).toContain('b')
  })
})
