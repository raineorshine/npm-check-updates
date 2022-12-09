import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('rc-config', () => {
  it('print rcConfigPath when there is a non-empty rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{"filter": "ncu-test-v2"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir],
        '{ "dependencies": { "ncu-test-v2": "1.0.0", "ncu-test-tag": "0.1.0" } }',
      )
      text.should.containIgnoreCase(`Using config file ${tempConfigFile}`)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('do not print rcConfigPath when there is no rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    try {
      const text = await spawn('node', [bin, '--cwd', tempDir], '{ "dependencies": { "ncu-test-v2": "1.0.0" } }')
      text.should.not.include('Using config file')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('do not print rcConfigPath when there is an empty rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--configFilePath', tempDir],
        '{ "dependencies": { "ncu-test-v2": "1", "ncu-test-tag": "0.1.0" } }',
      )
      text.should.not.include('Using config file')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('read --configFilePath', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "filter": "ncu-test-v2"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir],
        '{ "dependencies": { "ncu-test-v2": "1", "ncu-test-tag": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('ncu-test-v2')
      pkgData.should.not.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('read --configFileName', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFileName = '.rctemp.json'
    const tempConfigFile = path.join(tempDir, tempConfigFileName)
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "filter": "ncu-test-v2"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir, '--configFileName', tempConfigFileName],
        '{ "dependencies": { "ncu-test-v2": "1", "ncu-test-tag": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('ncu-test-v2')
      pkgData.should.not.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('override config with arguments', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "filter": "ncu-test-v2"}', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir, '--filter', 'ncu-test-tag'],
        '{ "dependencies": { "ncu-test-v2": "1", "ncu-test-tag": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('ncu-test-tag')
      pkgData.should.not.have.property('ncu-test-v2')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('handle boolean arguments', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    // if boolean arguments are not handled as a special case, ncu will incorrectly pass "--deep false" to commander, which will interpret it as two args, i.e. --deep and --filter false
    await fs.writeFile(tempConfigFile, '{"jsonUpgraded": true, "deep": false }', 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir],
        '{ "dependencies": { "ncu-test-tag": "0.1.0" } }',
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
