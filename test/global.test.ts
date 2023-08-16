import path from 'path'
import spawn from 'spawn-please'

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('global', () => {
  // TODO: Hangs on Windows
  const itMaySkip = process.platform === 'win32' ? it.skip : it
  itMaySkip('global should run', async () => {
    // to speed up the test, only check npm (which is always installed globally)
    await spawn('node', [bin, '--global', 'npm'])
  })
})
