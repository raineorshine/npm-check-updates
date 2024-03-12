import memoize from 'fast-memoize'
import findUp from 'find-up'
import fs from 'fs/promises'
import ini from 'ini'
import path from 'path'
import spawn from 'spawn-please'
import keyValueBy from '../lib/keyValueBy'
import { print } from '../lib/logging'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { NpmConfig } from '../types/NpmConfig'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { SpawnOptions } from '../types/SpawnOptions'
import { Version } from '../types/Version'
import * as npm from './npm'

// return type of pnpm ls --json
type PnpmList = {
  path: string
  private: boolean
  dependencies: Index<{
    from: string
    version: Version
    resolved: string
  }>
}[]

/** Reads the npmrc config file from the pnpm-workspace.yaml directory. */
const npmConfigFromPnpmWorkspace = memoize(async (options: Options): Promise<NpmConfig> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml')
  if (!pnpmWorkspacePath) return {}

  const pnpmWorkspaceDir = path.dirname(pnpmWorkspacePath)
  const pnpmWorkspaceConfigPath = path.join(pnpmWorkspaceDir, '.npmrc')

  let pnpmWorkspaceConfig
  try {
    pnpmWorkspaceConfig = await fs.readFile(pnpmWorkspaceConfigPath, 'utf-8')
  } catch (e) {
    return {}
  }

  print(options, `\nUsing pnpm workspace config at ${pnpmWorkspaceConfigPath}:`, 'verbose')

  const config = npm.normalizeNpmConfig(ini.parse(pnpmWorkspaceConfig), pnpmWorkspaceDir)

  print(options, config, 'verbose')

  return config
})

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls for completeness
  // this should never happen since list is only called in runGlobal -> getInstalledPackages
  if (!options.global) return npm.list(options)

  const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = JSON.parse(await spawn(cmd, ['ls', '-g', '--json'])) as PnpmList
  const list = keyValueBy(result[0].dependencies || {}, (name, { version }) => ({
    [name]: version,
  }))
  return list
}

/** Wraps a GetVersion function and passes the npmrc located next to the pnpm-workspace.yaml if it exists. */
const withNpmWorkspaceConfig =
  (getVersion: GetVersion): GetVersion =>
  async (packageName, currentVersion, options = {}) =>
    getVersion(packageName, currentVersion, options, {}, await npmConfigFromPnpmWorkspace(options))

export const distTag = withNpmWorkspaceConfig(npm.distTag)
export const greatest = withNpmWorkspaceConfig(npm.greatest)
export const latest = withNpmWorkspaceConfig(npm.latest)
export const minor = withNpmWorkspaceConfig(npm.minor)
export const newest = withNpmWorkspaceConfig(npm.newest)
export const patch = withNpmWorkspaceConfig(npm.patch)
export const semver = withNpmWorkspaceConfig(npm.semver)

/**
 * Spawn pnpm.
 *
 * @param args
 * @param [npmOptions={}]
 * @param [spawnOptions={}]
 * @returns
 */
export default async function spawnPnpm(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnOptions?: SpawnOptions,
): Promise<string> {
  const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  const fullArgs = [
    ...(npmOptions.global ? 'global' : []),
    ...(Array.isArray(args) ? args : [args]),
    ...(npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : []),
  ]

  return spawn(cmd, fullArgs, spawnOptions)
}

export { defaultPrefix, getPeerDependencies, packageAuthorChanged } from './npm'
