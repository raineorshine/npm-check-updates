import fs from 'fs'
import path from 'path'
import spawn from 'spawn-please'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('--interactive', () => {
  let last = 0

  /** Gets the temporary package file path. */
  const getTempFile = () => `test/temp_package${++last}.json`

  it('prompt for each dependency', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      await spawn('node', [bin, '--interactive', '--packageFile', tempFile], {
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version']]),
        },
      })

      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })
    } finally {
      fs.unlinkSync(tempFile)
    }
  })

  it('with --format group', async () => {
    const tempFile = getTempFile()
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      await spawn('node', [bin, '--interactive', '--format', 'group', '--packageFile', tempFile], {
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version']]),
        },
      })

      const upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })
    } finally {
      fs.unlinkSync(tempFile)
    }
  })
})
