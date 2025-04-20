import { expect } from 'chai'
import path from 'path'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')

describe('global', () => {
  // TODO: Hangs on Windows
  const itSkipWindows = process.platform === 'win32' ? it.skip : it

  itSkipWindows('should run on npm', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--global', 'npm'])
    expect(JSON.parse(stdout)).to.have.property('npm')
  })

  itSkipWindows('should run on yarn', async () => {
    await spawn('yarn', ['global', 'add', 'firequiz@0.0.2'])

    const { stdout } = await spawn('yarn', ['run', '-s', 'ncu', '--jsonUpgraded', '--global', 'firequiz'])
    expect(JSON.parse(stdout)).to.have.property('firequiz')

    await spawn('yarn', ['global', 'remove', 'firequiz'])
  })

  itSkipWindows('should run on pnpm', async () => {
    await spawn('pnpm', ['add', '-g', 'firequiz@0.0.2'])

    const { stdout } = await spawn('pnpm', ['run', '--silent', 'ncu', '--jsonUpgraded', '--global', 'firequiz'])
    expect(JSON.parse(stdout)).to.have.property('firequiz')

    await spawn('pnpm', ['remove', '-g', 'firequiz'])
  })

  itSkipWindows('should run on bun', async () => {
    await spawn('bun', ['add', '-g', 'firequiz@0.0.2'])

    const { stdout } = await spawn('bun', ['run', bin, '--jsonUpgraded', '--global', 'firequiz'])
    expect(JSON.parse(stdout)).to.have.property('firequiz')

    await spawn('bun', ['remove', '-g', 'firequiz'])
  })

  itSkipWindows('should default to npm when running on deno', async () => {
    await spawn('npm', ['install', '-g', 'firequiz@0.0.2'])

    const { stdout } = await spawn('deno', [
      'run',
      '--quiet',
      '--allow-read',
      '--allow-write',
      '--allow-run',
      'ncu',
      '--jsonUpgraded',
      '--global',
      'firequiz',
    ])
    expect(JSON.parse(stdout)).to.have.property('firequiz')

    await spawn('npm', ['uninstall', '-g', 'firequiz'])
  })
})
