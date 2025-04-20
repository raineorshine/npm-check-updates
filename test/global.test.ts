import { expect } from 'chai'
import path from 'path'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')

describe('global', () => {
  // TODO: Hangs on Windows
  const itSkipWindows = process.platform === 'win32' ? it.skip : it
  itSkipWindows('global should run', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--global', 'npm'])
    expect(JSON.parse(stdout))
  })
})
