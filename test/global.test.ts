import { expect } from 'chai'
import path from 'path'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('global', () => {
  // TODO: Hangs on Windows
  const itSkipWindows = process.platform === 'win32' ? it.skip : it
  itSkipWindows('global should run', async () => {
    // to speed up the test, only check npm (which is always installed globally)
    const { stdout } = await spawn('node', [bin, '--jsonAll', '--global', 'npm'])
    const json = JSON.parse(stdout)
    expect(json).to.have.property('npm')
  })
})
