import { getSpawnCommands } from '../src/lib/spawnCommand'

describe('spawnCommand', () => {
  it('prefers cmd shims on Windows and falls back to extensionless commands', () => {
    getSpawnCommands('pnpm', 'win32').should.deep.equal(['pnpm.cmd', 'pnpm'])
  })

  it('does not use cmd shims on non-Windows platforms', () => {
    getSpawnCommands('pnpm', 'linux').should.deep.equal(['pnpm'])
  })

  it('does not use cmd shims for bun on Windows', () => {
    getSpawnCommands('bun', 'win32').should.deep.equal(['bun'])
  })
})
