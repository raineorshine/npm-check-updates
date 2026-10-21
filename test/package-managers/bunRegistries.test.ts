import { once } from 'node:events'
import fs from 'node:fs/promises'
import http from 'node:http'
import { type AddressInfo } from 'node:net'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as bun from '../../src/package-managers/bun.ts'
import { npmApi } from '../../src/package-managers/npm.ts'
import makeTempDir from '../helpers/makeTempDir.ts'
import removeDir from '../helpers/removeDir.ts'

/** Encodes a string in base64, as npm's _auth setting is. */
const base64 = (value: string) => Buffer.from(value).toString('base64')

describe('bun registries', () => {
  let projectDir: string
  let xdgDir: string
  let originalCwd: string
  let originalXdgConfigHome: string | undefined

  /** Writes the project bunfig.toml. */
  const writeBunfig = (content: string) => fs.writeFile(path.join(projectDir, 'bunfig.toml'), content)

  /** Writes the global bunfig.toml, which bun reads from $XDG_CONFIG_HOME when it is set. */
  const writeGlobalBunfig = (content: string) => fs.writeFile(path.join(xdgDir, '.bunfig.toml'), content)

  beforeEach(async () => {
    originalCwd = process.cwd()
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME
    projectDir = await makeTempDir('ncu-test-bun-project-')
    xdgDir = await makeTempDir('ncu-test-bun-xdg-')
    process.env.XDG_CONFIG_HOME = xdgDir
    process.chdir(projectDir)
    // ignore the registry in the npm config of the machine running the tests
    vi.spyOn(npmApi, 'findNpmConfig').mockReturnValue({})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    process.chdir(originalCwd)
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome
    }
    await removeDir(projectDir)
    await removeDir(xdgDir)
  })

  // .invalid never resolves, so the host in the fetch error identifies the registry that was used
  it('fetches from the registry in bunfig.toml', async () => {
    await writeBunfig('[install]\nregistry = "https://bunfig-registry.invalid/"\n')

    await expect(bun.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /bunfig-registry\.invalid/,
    )
  })

  it('fetches scoped packages from their scoped registry', async () => {
    await writeBunfig(
      '[install]\nregistry = "https://bunfig-registry.invalid/"\n\n[install.scopes]\n"@ncu-scope" = "https://scoped-registry.invalid/"\n',
    )

    await expect(bun.latest('@ncu-scope/pkg', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /scoped-registry\.invalid/,
    )
  })

  it('accepts a scope name without @', async () => {
    await writeBunfig('[install.scopes]\nncu-scope = { url = "https://scoped-registry.invalid/", token = "abc" }\n')

    await expect(bun.latest('@ncu-scope/pkg', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /scoped-registry\.invalid/,
    )
  })

  it('fetches from the registry in the global bunfig.toml', async () => {
    await writeGlobalBunfig('[install]\nregistry = "https://global-registry.invalid/"\n')

    await expect(bun.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /global-registry\.invalid/,
    )
  })

  it('prefers the project bunfig.toml over the global one', async () => {
    await writeGlobalBunfig('[install]\nregistry = "https://global-registry.invalid/"\n')
    await writeBunfig('[install]\nregistry = "https://bunfig-registry.invalid/"\n')

    await expect(bun.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /bunfig-registry\.invalid/,
    )
  })

  it('reads the bunfig.toml next to the package file', async () => {
    const packageDir = path.join(projectDir, 'pkg')
    await fs.mkdir(packageDir)
    await fs.writeFile(
      path.join(packageDir, 'bunfig.toml'),
      '[install]\nregistry = "https://package-registry.invalid/"\n',
    )

    await expect(
      bun.latest('ncu-test-v2', '1.0.0', { packageFile: path.join(packageDir, 'package.json'), retry: 0 }),
    ).rejects.toThrow(/package-registry\.invalid/)
  })

  it('ignores a byte order mark', async () => {
    await writeBunfig('\uFEFF[install]\nregistry = "https://bunfig-registry.invalid/"\n')

    await expect(bun.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /bunfig-registry\.invalid/,
    )
  })

  it('reads the registry URL from an environment variable', async () => {
    process.env.NCU_TEST_BUN_REGISTRY = 'https://env-registry.invalid/'
    try {
      await writeBunfig('[install]\nregistry = "$NCU_TEST_BUN_REGISTRY"\n')

      await expect(bun.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
        /env-registry\.invalid/,
      )
    } finally {
      delete process.env.NCU_TEST_BUN_REGISTRY
    }
  })

  // as for yarn and pnpm, the project/cwd .npmrc stays on top
  it('is overridden by the registry in the .npmrc in the cwd', async () => {
    await writeBunfig('[install]\nregistry = "https://bunfig-registry.invalid/"\n')
    await fs.writeFile(path.join(projectDir, '.npmrc'), 'registry=https://npmrc-registry.invalid/\n')

    await expect(bun.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /npmrc-registry\.invalid/,
    )
  })

  it('prefers an explicitly specified registry over bunfig.toml', async () => {
    await writeBunfig('[install]\nregistry = "https://bunfig-registry.invalid/"\n')

    await expect(
      bun.latest('ncu-test-v2', '1.0.0', {
        cwd: projectDir,
        registry: 'https://explicit-registry.invalid/',
        retry: 0,
      }),
    ).rejects.toThrow(/explicit-registry\.invalid/)
  })

  it('fetches dist-tags from the bunfig.toml registry', async () => {
    await writeBunfig('[install]\nregistry = "https://bunfig-registry.invalid/"\n')

    await expect(bun.getDistTags('ncu-test-v2', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /bunfig-registry\.invalid/,
    )
  })

  describe('credentials', () => {
    let server: http.Server
    let registryUrl: string
    let authorizations: (string | undefined)[]

    beforeEach(async () => {
      authorizations = []
      server = http.createServer((req, res) => {
        authorizations.push(req.headers.authorization)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            name: '@ncu-scope/pkg',
            'dist-tags': { latest: '2.0.0' },
            versions: {
              '1.0.0': { name: '@ncu-scope/pkg', version: '1.0.0' },
              '2.0.0': { name: '@ncu-scope/pkg', version: '2.0.0' },
            },
          }),
        )
      })
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/npm/`
    })

    afterEach(async () => {
      server.close()
      await once(server, 'close')
    })

    it('sends the token of the scoped registry', async () => {
      await writeBunfig(`[install.scopes]\nncu-scope = { url = "${registryUrl}", token = "abc" }\n`)

      await expect(bun.latest('@ncu-scope/pkg', '1.0.0', { cwd: projectDir, retry: 0 })).resolves.toMatchObject({
        version: '2.0.0',
      })
      // every request to the registry, including retries and full metadata fetches, carries the token
      expect(authorizations.length).toBeGreaterThan(0)
      expect(new Set(authorizations)).toStrictEqual(new Set(['Bearer abc']))
    })

    it('reads the bunfig.toml next to the lockfile, not the one in a workspace package', async () => {
      const workspaceDir = path.join(projectDir, 'packages', 'a')
      await fs.mkdir(workspaceDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, 'bun.lock'), '')
      await writeBunfig(`[install.scopes]\nncu-scope = { url = "${registryUrl}", token = "root" }\n`)
      await fs.writeFile(
        path.join(workspaceDir, 'bunfig.toml'),
        `[install.scopes]\nncu-scope = { url = "${registryUrl}", token = "member" }\n`,
      )

      await expect(bun.latest('@ncu-scope/pkg', '1.0.0', { cwd: workspaceDir, retry: 0 })).resolves.toMatchObject({
        version: '2.0.0',
      })
      expect(new Set(authorizations)).toStrictEqual(new Set(['Bearer root']))
    })

    it('replaces the credentials of a global scope with those of the project scope', async () => {
      await writeGlobalBunfig(`[install.scopes]\nncu-scope = { url = "${registryUrl}", token = "global" }\n`)
      await writeBunfig(
        `[install.scopes]\nncu-scope = { url = "${registryUrl}", username = "user", password = "pass" }\n`,
      )

      await expect(bun.latest('@ncu-scope/pkg', '1.0.0', { cwd: projectDir, retry: 0 })).resolves.toMatchObject({
        version: '2.0.0',
      })
      expect(authorizations.length).toBeGreaterThan(0)
      expect(new Set(authorizations)).toStrictEqual(new Set([`Basic ${base64('user:pass')}`]))
    })
  })
})

describe('npmConfigFromBunfig', () => {
  it('converts the default and scoped registries', () => {
    expect(
      bun.npmConfigFromBunfig({
        install: {
          registry: 'https://registry.example.com',
          scopes: { '@myorg': 'https://myorg.example.com/npm/', other: 'https://other.example.com/' },
        },
      }),
    ).toEqual({
      registry: 'https://registry.example.com/',
      '@myorg:registry': 'https://myorg.example.com/npm/',
      '@other:registry': 'https://other.example.com/',
    })
  })

  it('converts a token', () => {
    expect(
      bun.npmConfigFromBunfig({
        install: { scopes: { myorg: { url: 'https://myorg.example.com/npm', token: 'abc' } } },
      }),
    ).toEqual({
      '@myorg:registry': 'https://myorg.example.com/npm',
      '//myorg.example.com/npm/:_authToken': 'abc',
    })
  })

  it('converts a username and password', () => {
    expect(
      bun.npmConfigFromBunfig({
        install: { registry: { url: 'https://registry.example.com/', username: 'user', password: 'pass' } },
      }),
    ).toEqual({
      registry: 'https://registry.example.com/',
      '//registry.example.com/:_auth': base64('user:pass'),
    })
  })

  it('converts credentials in the URL', () => {
    expect(
      bun.npmConfigFromBunfig({
        install: {
          registry: 'https://us%40r:p%3Ass@registry.example.com/',
          scopes: { myorg: 'https://:abc@myorg.example.com/' },
        },
      }),
    ).toEqual({
      registry: 'https://registry.example.com/',
      '//registry.example.com/:_auth': base64('us@r:p:ss'),
      '@myorg:registry': 'https://myorg.example.com/',
      '//myorg.example.com/:_authToken': 'abc',
    })
  })

  it('keeps a malformed escape in URL credentials, like bun', () => {
    expect(bun.npmConfigFromBunfig({ install: { registry: 'https://user:p%ss@registry.example.com/' } })).toEqual({
      registry: 'https://registry.example.com/',
      '//registry.example.com/:_auth': base64('user:p%ss'),
    })
  })

  it('replaces credentials in the URL with the credential keys', () => {
    expect(
      bun.npmConfigFromBunfig({
        install: { registry: { url: 'https://user:pass@registry.example.com/', token: 'abc' } },
      }),
    ).toEqual({
      registry: 'https://registry.example.com/',
      '//registry.example.com/:_authToken': 'abc',
    })
  })

  it('expands credentials that reference environment variables', () => {
    expect(
      bun.npmConfigFromBunfig(
        {
          install: {
            registry: { url: 'https://registry.example.com/', username: '$NPM_USER', password: '$NPM_PASSWORD' },
            scopes: { myorg: { url: 'https://myorg.example.com/', token: '$NPM_TOKEN' } },
          },
        },
        { NPM_USER: 'user', NPM_PASSWORD: 'pass', NPM_TOKEN: 'abc' },
      ),
    ).toEqual({
      registry: 'https://registry.example.com/',
      '//registry.example.com/:_auth': base64('user:pass'),
      '@myorg:registry': 'https://myorg.example.com/',
      '//myorg.example.com/:_authToken': 'abc',
    })
  })

  it('ignores a credential whose environment variable is unset, like bun', () => {
    expect(
      bun.npmConfigFromBunfig(
        { install: { scopes: { myorg: { url: 'https://myorg.example.com/', token: '$NPM_TOKEN' } } } },
        {},
      ),
    ).toEqual({ '@myorg:registry': 'https://myorg.example.com/' })
  })

  it('skips invalid registries', () => {
    expect(
      bun.npmConfigFromBunfig(
        { install: { registry: '$UNSET_REGISTRY', scopes: { myorg: 'not a url', other: 42 as unknown as string } } },
        {},
      ),
    ).toEqual({})
    expect(
      bun.npmConfigFromBunfig({
        install: { scopes: [{ url: 'https://myorg.example.com/' }] as unknown as Record<string, string> },
      }),
    ).toEqual({})
  })
})
