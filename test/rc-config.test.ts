import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import chaiSetup from './helpers/chaiSetup'
import stubNpmView from './helpers/stubNpmView'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('rc-config', () => {
  // before/after must be placed within the describe block, otherwise they will apply to tests in other files
  let stub: { restore: () => void }
  before(() => (stub = stubNpmView('99.9.9', { spawn: true })))
  after(() => stub.restore())

  it('print rcConfigPath when there is a non-empty rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, JSON.stringify({ filter: 'ncu-test-v2' }), 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '0.1.0' } }),
      )
      text.should.containIgnoreCase(`Using config file ${tempConfigFile}`)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('do not print rcConfigPath when there is no rc config file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--cwd', tempDir],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }),
      )
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
        [bin, '--stdin', '--configFilePath', tempDir],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1', 'ncu-test-tag': '0.1.0' } }),
      )
      text.should.not.include('Using config file')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('read --configFilePath', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, JSON.stringify({ jsonUpgraded: true, filter: 'ncu-test-v2' }), 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1', 'ncu-test-tag': '0.1.0' } }),
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
    await fs.writeFile(tempConfigFile, JSON.stringify({ jsonUpgraded: true, filter: 'ncu-test-v2' }), 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir, '--configFileName', tempConfigFileName],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1', 'ncu-test-tag': '0.1.0' } }),
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
    await fs.writeFile(tempConfigFile, JSON.stringify({ jsonUpgraded: true, filter: 'ncu-test-v2' }), 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir, '--filter', 'ncu-test-tag'],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1', 'ncu-test-tag': '0.1.0' } }),
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('ncu-test-tag')
      pkgData.should.not.have.property('ncu-test-v2')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('override true in config with false in the cli', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    await fs.writeFile(tempConfigFile, JSON.stringify({ jsonUpgraded: true }), 'utf-8')
    try {
      const output = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir, '--no-jsonUpgraded'],
        JSON.stringify({ dependencies: { 'ncu-test-v2': '1', 'ncu-test-tag': '0.1.0' } }),
      )
      // if the output contains "Using config file", then we know that jsonUpgraded was overridden
      output.should.include('Using config file')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('handle boolean arguments', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const tempConfigFile = path.join(tempDir, '.ncurc.json')
    // if boolean arguments are not handled as a special case, ncu will incorrectly pass "--deep false" to commander, which will interpret it as two args, i.e. --deep and --filter false
    await fs.writeFile(tempConfigFile, JSON.stringify({ jsonUpgraded: true, deep: false }), 'utf-8')
    try {
      const text = await spawn(
        'node',
        [bin, '--stdin', '--configFilePath', tempDir],
        JSON.stringify({ dependencies: { 'ncu-test-tag': '0.1.0' } }),
      )
      const pkgData = JSON.parse(text)
      pkgData.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('auto detect .ncurc.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const configFile = path.join(tempDir, '.ncurc.json')
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(configFile, JSON.stringify({ filter: 'ncu-test-v2' }), 'utf-8')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '0.1.0' } }),
      'utf-8',
    )
    try {
      // awkwardly, we have to set mergeConfig to enable autodetecting the rcconfig because otherwise it is explicitly disabled for tests
      const text = await spawn('node', [bin, '--mergeConfig'], { cwd: tempDir })
      const firstLine = text.split('\n')[0]
      // On OSX tempDir is /var/folders/cb/12345, but npm-check-updates recieves /private/var/folders/cb/12345.
      // Apparently OSX symlinks /tmp to /private/tmp for historical reasons.
      // Therefore, ignore any directories prepended to the config file path.
      firstLine.should.contains('Using config file')
      firstLine.should.contains(configFile)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('auto detect .ncurc.cjs', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const configFile = path.join(tempDir, '.ncurc.cjs')
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(configFile, 'module.exports = { "filter": "ncu-test-v2" }', 'utf-8')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '0.1.0' } }),
      'utf-8',
    )
    try {
      // awkwardly, we have to set mergeConfig to enable autodetecting the rcconfig because otherwise it is explicitly disabled for tests
      const text = await spawn('node', [bin, '--mergeConfig'], { cwd: tempDir })
      const firstLine = text.split('\n')[0]
      // On OSX tempDir is /var/folders/cb/12345, but npm-check-updates recieves /private/var/folders/cb/12345.
      // Apparently OSX symlinks /tmp to /private/tmp for historical reasons.
      // Therefore, ignore any directories prepended to the config file path.
      firstLine.should.contains('Using config file')
      firstLine.should.contains(configFile)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('should not crash if because of $schema property', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const configFile = path.join(tempDir, '.ncurc.json')
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(configFile, JSON.stringify({ $schema: 'schema url' }), 'utf-8')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { axios: '1.0.0' } }), 'utf-8')

    try {
      // awkwardly, we have to set mergeConfig to enable autodetecting the rcconfig because otherwise it is explicitly disabled for tests
      await spawn('node', [bin, '--mergeConfig'], { cwd: tempDir })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
