import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import path from 'path'
import spawn from 'spawn-please'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('--format time', () => {
  it('show publish time', async () => {
    const timestamp = '2020-04-27T21:48:11.660Z'
    const stub = stubNpmView(
      {
        version: '99.9.9',
        time: {
          '99.9.9': timestamp,
        },
      },
      { spawn: true },
    )
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
      },
    }
    const output = await spawn('node', [bin, '--format', 'time', '--stdin'], JSON.stringify(packageData))
    expect(output).contains(timestamp)
    stub.restore()
  })
})
