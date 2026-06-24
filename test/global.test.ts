import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { runNcuCli } from './helpers/runNcuCli'
import stubVersions from './helpers/stubVersions'

describe('global', () => {
  it('global should run', async () => {
    stubVersions({
      'ncu-test-v2': { version: '2.0.0' },
      'ncu-test-tag': { version: '1.1.0' },
    })
    // create another folder with fixed name
    const cwd = path.join(sandbox.cwd, 'npm-global-test')
    await fs.mkdir(cwd, { recursive: true })
    await sandbox.createPackageJson({ dependencies: { 'ncu-test-v2': '^1.0.0', 'ncu-test-tag': '^1.0.0' } }, cwd)
    for (const pkg of ['ncu-test-v2', 'ncu-test-tag']) {
      const pkgFolder = path.join(cwd, 'node_modules', pkg)
      await fs.mkdir(pkgFolder, { recursive: true })
      await fs.writeFile(path.join(pkgFolder, 'package.json'), JSON.stringify({ name: pkg, version: '1.0.0' }))
    }
    const cache = path.join(cwd, '.npm-cache')
    const npmrc = path.join(cwd, 'etc', 'npmrc')
    const { stdout } = await runNcuCli(['--jsonUpgraded', '--global'], {
      cwd,
      env: {
        NPM_CONFIG_PREFIX: cwd,
        npm_config_prefix: cwd,
        NPM_CONFIG_GLOBAL_PREFIX: cwd,
        npm_config_global_prefix: cwd,
        NPM_CONFIG_CACHE: cache,
        npm_config_cache: cache,
        NPM_CONFIG_GLOBALCONFIG: npmrc,
        npm_config_globalconfig: npmrc,
      },
    })

    expect(JSON.parse(stdout)).deep.eq({ 'ncu-test-tag': '1.1.0', 'ncu-test-v2': '2.0.0' })
  })
})
