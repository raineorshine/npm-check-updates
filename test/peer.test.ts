import fs from 'fs/promises'
import path from 'path'
import ncu from '../src/'
import spawnNpm from '../src/package-managers/npm'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

describe('peer dependencies', function () {
  it('peer dependencies of installed packages are ignored by default', async () => {
    const cwd = path.join(__dirname, 'test-data/peer/')
    try {
      await spawnNpm('install', {}, { cwd })
      const upgrades = await ncu({ cwd })
      upgrades!.should.deep.equal({
        'ncu-test-return-version': '2.0.0',
      })
    } finally {
      await fs.rm(path.join(cwd, 'node_modules'), { recursive: true, force: true })
      await fs.rm(path.join(cwd, 'package-lock.json'), { recursive: true, force: true })
    }
  })

  it('peer dependencies of installed packages are checked when using option peer', async () => {
    const cwd = path.join(__dirname, 'test-data/peer/')
    try {
      await spawnNpm('install', {}, { cwd })
      const upgrades = await ncu({ cwd, peer: true })
      upgrades!.should.deep.equal({
        'ncu-test-return-version': '1.1.0',
      })
    } finally {
      await fs.rm(path.join(cwd, 'node_modules'), { recursive: true, force: true })
      await fs.rm(path.join(cwd, 'package-lock.json'), { recursive: true, force: true })
    }
  })

  it('peer dependencies of installed packages are checked iteratively when using option peer', async () => {
    const cwd = path.join(__dirname, 'test-data/peer-update/')
    try {
      await spawnNpm('install', {}, { cwd })
      const upgrades = await ncu({ cwd, peer: true })
      upgrades!.should.deep.equal({
        'ncu-test-return-version': '1.1.0',
        'ncu-test-peer-update': '1.1.0',
      })
    } finally {
      await fs.rm(path.join(cwd, 'node_modules'), { recursive: true, force: true })
      await fs.rm(path.join(cwd, 'package-lock.json'), { recursive: true, force: true })
    }
  })
})
