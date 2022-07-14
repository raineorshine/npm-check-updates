import path from 'path'
import spawn from 'spawn-please'

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('global', () => {
  // TODO: Hangs on Windows
  const test = process.platform === 'win32' ? it.skip : it
  test('global should run', async () => {
    await spawn('node', [bin, '--global'])
  })
})
