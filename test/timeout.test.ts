import fs from 'fs/promises'
import path from 'path'
import spawn from 'spawn-please'
import ncu from '../src/'
import chaiSetup from './helpers/chaiSetup'
import stubNpmView from './helpers/stubNpmView'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

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
    const stub = stubNpmView('99.9.9', { spawn: true })
    await spawn('node', [bin, '--timeout', '100000'], { stdin: '{ "dependencies": { "express": "1" } }' })
    stub.restore()
  })
})
