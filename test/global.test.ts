import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')

describe('global', () => {
  // TODO: Hangs on Windows
  const itSkipWindows = process.platform === 'win32' ? it.skip : it
  itSkipWindows('global should run', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--global', 'npm'])
    expect(JSON.parse(stdout))
  })
})
