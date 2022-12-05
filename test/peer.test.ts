import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import path from 'path'
import rimraf from 'rimraf'
import * as ncu from '../src/'
import spawnNpm from '../src/package-managers/npm'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('peer dependencies', function () {
  it('peer dependencies of installed packages are ignored by default', async () => {
    const cwd = path.join(__dirname, 'test-data/peer/')
    try {
      await spawnNpm('install', {}, { cwd })
      const upgrades = await ncu.run({ cwd })
      upgrades!.should.deep.equal({
        'ncu-test-return-version': '2.0.0',
      })
    } finally {
      rimraf.sync(path.join(cwd, 'node_modules'))
      rimraf.sync(path.join(cwd, 'package-lock.json'))
    }
  })

  it('peer dependencies of installed packages are checked when using option peer', async () => {
    const cwd = path.join(__dirname, 'test-data/peer/')
    try {
      await spawnNpm('install', {}, { cwd })
      const upgrades = await ncu.run({ cwd, peer: true })
      upgrades!.should.deep.equal({
        'ncu-test-return-version': '1.1.0',
      })
    } finally {
      rimraf.sync(path.join(cwd, 'node_modules'))
      rimraf.sync(path.join(cwd, 'package-lock.json'))
    }
  })

  it('peer dependencies of installed packages are checked iteratively when using option peer', async () => {
    const cwd = path.join(__dirname, 'test-data/peer-update/')
    try {
      await spawnNpm('install', {}, { cwd })
      const upgrades = await ncu.run({ cwd, peer: true })
      upgrades!.should.deep.equal({
        'ncu-test-return-version': '1.1.0',
        'ncu-test-peer-update': '1.1.0',
      })
    } finally {
      rimraf.sync(path.join(cwd, 'node_modules'))
      rimraf.sync(path.join(cwd, 'package-lock.json'))
    }
  })
})
