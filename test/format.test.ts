import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import path from 'path'
import spawn from 'spawn-please'

chai.should()
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('--format time', () => {
  it('show publish time', async () => {
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
      },
    }
    const output = await spawn('node', [bin, '--format', 'time', '--stdin'], JSON.stringify(packageData))
    expect(output).contains('2020-04-27T21:48:11.660Z')
  })
})
