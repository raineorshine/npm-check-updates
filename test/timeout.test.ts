import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'spawn-please'
import ncu from '../src/index.js'
import chaiSetup from './helpers/chaiSetup.js'
import stubVersions from './helpers/stubVersions.js'

chaiSetup()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bin = path.join(__dirname, '../build/src/cli.js')

describe('timeout', function () {
  it('throw an exception instead of printing to the console when timeout is exceeded', async () => {
    const pkgPath = path.join(__dirname, './test-data/ncu/package-large.json')
    return ncu({
      packageData: await fs.readFile(pkgPath, 'utf-8'),
      timeout: 1,
    }).should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
  })

  it('exit with error when timeout is exceeded', async () => {
    return spawn('node', [bin, '--timeout', '1'], {
      stdin: '{ "dependencies": { "express": "1" } }',
    }).should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
  })

  it('completes successfully with timeout', async () => {
    const stub = stubVersions('99.9.9')
    await spawn('node', [bin, '--timeout', '100000'], { stdin: '{ "dependencies": { "express": "1" } }' })
    stub.restore()
  })
})
