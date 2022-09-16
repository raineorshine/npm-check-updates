import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import * as ncu from '../src/'

chai.should()
chai.use(chaiAsPromised)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')

/** Creates a temp directory with nested package files for --workspaces testing. Returns the temp directory name (should be removed by caller).
 *
 * The file tree that is created is:
 * |- package.json
 * |- packages/
 * |  - a/
 * |    - package.json
 * |  - b/
 * |    - package.json
 */
const setup = async (workspaces: string[] = ['packages/**']) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))

  const pkgDataRoot = JSON.stringify({
    dependencies: {
      'ncu-test-v2': '1.0.0',
    },
    workspaces,
  })

  const pkgDataA = JSON.stringify({
    dependencies: {
      'ncu-test-tag': '1.0.0',
    },
  })

  const pkgDataB = JSON.stringify({
    dependencies: {
      'ncu-test-return-version': '1.0.0',
    },
  })

  // write root package file
  await fs.writeFile(path.join(tempDir, 'package.json'), pkgDataRoot, 'utf-8')

  // write workspace package files
  await fs.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/a/package.json'), pkgDataA, 'utf-8')
  await fs.mkdir(path.join(tempDir, 'packages/b'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/b/package.json'), pkgDataB, 'utf-8')

  return tempDir
}

describe('--workspaces', function () {
  this.timeout(60000)

  it('do not allow --workspaces and --deep together', () => {
    ncu.run({ workspaces: true, deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('update workspaces with --workspaces', async () => {
    const tempDir = await setup(['packages/a'])
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--workspaces'], { cwd: tempDir }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.not.have.property('packages/b/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update workspaces glob', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--workspaces'], { cwd: tempDir }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update workspaces with -ws', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '-ws'], { cwd: tempDir }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('do not update non-workspace subpackages', async () => {
    const tempDir = await setup()
    await fs.mkdir(path.join(tempDir, 'other'), { recursive: true })
    await fs.writeFile(
      path.join(tempDir, 'other/package.json'),
      JSON.stringify({
        dependencies: {
          'ncu-test-return-version': '1.0.0',
        },
      }),
      'utf-8',
    )

    try {
      const output = await spawn('node', [bin, '--jsonAll', '--workspaces'], { cwd: tempDir }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output.should.not.have.property('other/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('--workspace', function () {
  this.timeout(60000)

  it('do not allow --workspace and --deep together', () => {
    ncu.run({ workspace: ['a'], deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('do not allow --workspace and --workspaces together', () => {
    ncu.run({ workspace: ['a'], deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('update single workspace with --workspace', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--workspace', 'a'], { cwd: tempDir }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.not.have.property('packages/b/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update single workspace with -w', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '-w', 'a'], { cwd: tempDir }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.not.have.property('packages/b/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update more than one workspace', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--workspace', 'a', '--workspace', 'b'], {
        cwd: tempDir,
      }).then(JSON.parse)
      output.should.not.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('--withWorkspaces', function () {
  this.timeout(60000)

  it('do not allow --withWorkspaces and --deep together', () => {
    ncu.run({ withWorkspaces: true, deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('update root project and workspaces with --withWorkspaces', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--withWorkspaces'], { cwd: tempDir }).then(JSON.parse)
      output.should.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output['package.json'].dependencies.should.have.property('ncu-test-v2')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update root project and workspaces with -wws', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '-wws'], { cwd: tempDir }).then(JSON.parse)
      output.should.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output['package.json'].dependencies.should.have.property('ncu-test-v2')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('do not update non-workspace subpackages', async () => {
    const tempDir = await setup()
    await fs.mkdir(path.join(tempDir, 'other'), { recursive: true })
    await fs.writeFile(
      path.join(tempDir, 'other/package.json'),
      JSON.stringify({
        dependencies: {
          'ncu-test-return-version': '1.0.0',
        },
      }),
      'utf-8',
    )

    try {
      const output = await spawn('node', [bin, '--jsonAll', '--withWorkspaces'], { cwd: tempDir }).then(JSON.parse)
      output.should.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output.should.not.have.property('other/package.json')
      output['package.json'].dependencies.should.have.property('ncu-test-v2')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('--withWorkspace', function () {
  this.timeout(60000)

  it('do not allow --withWorkspace and --deep together', () => {
    ncu.run({ withWorkspace: ['a'], deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('do not allow --withWorkspace and --withWorkspaces together', () => {
    ncu.run({ withWorkspace: ['a'], deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('update single workspace with --withWorkspace', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--withWorkspace', 'a'], { cwd: tempDir }).then(JSON.parse)
      output.should.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.not.have.property('packages/b/package.json')
      output['package.json'].dependencies.should.have.property('ncu-test-v2')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update single workspace with -ww', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '-ww', 'a'], { cwd: tempDir }).then(JSON.parse)
      output.should.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.not.have.property('packages/b/package.json')
      output['package.json'].dependencies.should.have.property('ncu-test-v2')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update more than one workspace', async () => {
    const tempDir = await setup()
    try {
      const output = await spawn('node', [bin, '--jsonAll', '--withWorkspace', 'a', '--withWorkspace', 'b'], {
        cwd: tempDir,
      }).then(JSON.parse)
      output.should.have.property('package.json')
      output.should.have.property('packages/a/package.json')
      output.should.have.property('packages/b/package.json')
      output['package.json'].dependencies.should.have.property('ncu-test-v2')
      output['packages/a/package.json'].dependencies.should.have.property('ncu-test-tag')
      output['packages/b/package.json'].dependencies.should.have.property('ncu-test-return-version')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
