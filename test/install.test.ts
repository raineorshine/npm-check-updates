/* eslint-disable no-unused-expressions */
// eslint doesn't like .to.be.false syntax
import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import exists from '../src/lib/exists'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')

describe('install', () => {
  describe('non-interactive', () => {
    it('print install hint without --install', async () => {
      const { default: stripAnsi } = await import('strip-ansi')
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        const { stdout } = await spawn('node', [bin, '-u', '--packageFile', pkgFile])
        stripAnsi(stdout).should.include('Run npm install to install new versions')
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.false
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.false
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('install packages and do not print install hint with --install always', async () => {
      const { default: stripAnsi } = await import('strip-ansi')
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        const { stdout } = await spawn('node', [bin, '-u', '--packageFile', pkgFile, '--install', 'always'])
        stripAnsi(stdout).should.not.include('Run npm install to install new versions')
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.true
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.true
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('do not print install hint with --install never', async () => {
      const { default: stripAnsi } = await import('strip-ansi')
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        const { stdout } = await spawn('node', [bin, '-u', '--packageFile', pkgFile, '--install', 'never'])
        stripAnsi(stdout).should.not.include('Run npm install to install new versions')
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.false
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.false
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })
  })

  describe('interactive', () => {
    it('install when responding yes to prompt without --install', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        await spawn(
          'node',
          [bin, '-iu', '--packageFile', pkgFile],
          {},
          {
            env: {
              ...process.env,
              INJECT_PROMPTS: JSON.stringify([['ncu-test-v2'], true]),
            },
          },
        )
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.true
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.true
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('do not install when responding no to prompt without --install', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        await spawn(
          'node',
          [bin, '-iu', '--packageFile', pkgFile],
          {},
          {
            env: {
              ...process.env,
              INJECT_PROMPTS: JSON.stringify([['ncu-test-v2'], false]),
            },
          },
        )
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.false
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.false
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('install with --install always', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        await spawn(
          'node',
          [bin, '-iu', '--packageFile', pkgFile, '--install', 'always'],
          {},
          {
            env: {
              ...process.env,
              // NOTE: We can inject valuees, but we cannot test if the prompt was actually shown or not.
              // i.e. Testing that the prompt is not shown with --install always must be done manually.
              INJECT_PROMPTS: JSON.stringify([['ncu-test-v2']]),
            },
          },
        )
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.true
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.true
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('do not install with --install never', async () => {
      const pkgData = {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      }

      const stub = stubVersions('2.0.0', { spawn: true })
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkgData), 'utf-8')

      try {
        await spawn(
          'node',
          [bin, '-iu', '--packageFile', pkgFile, '--install', 'never'],
          {},
          {
            env: {
              ...process.env,
              // NOTE: We can inject valuees, but we cannot test if the prompt was actually shown or not.
              // i.e. Testing that the prompt is not shown with --install never must be done manually.
              INJECT_PROMPTS: JSON.stringify([['ncu-test-v2']]),
            },
          },
        )
        expect(await exists(path.join(tempDir, 'package-lock.json'))).to.be.false
        expect(await exists(path.join(tempDir, 'node_modules'))).to.be.false
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })
  })
})
