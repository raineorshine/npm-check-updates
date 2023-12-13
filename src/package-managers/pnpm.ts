import memoize from 'fast-memoize'
import findUp from 'find-up'
import fs from 'fs/promises'
import ini from 'ini'
import path from 'path'
import spawn from 'spawn-please'
import keyValueBy from '../lib/keyValueBy.js'
import { print } from '../lib/logging.js'
import { GetVersion } from '../types/GetVersion.js'
import { Index } from '../types/IndexType.js'
import { NpmConfig } from '../types/NpmConfig.js'
import { NpmOptions } from '../types/NpmOptions.js'
import { Options } from '../types/Options.js'
import { SpawnOptions } from '../types/SpawnOptions.js'
import { Version } from '../types/Version.js'
import {
  normalizeNpmConfig,
  distTag as npmDistTag,
  greatest as npmGreatest,
  latest as npmLatest,
  list as npmList,
  minor as npmMinor,
  newest as npmNewest,
  patch as npmPatch,
} from './npm.js'

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

  const config = normalizeNpmConfig(ini.parse(pnpmWorkspaceConfig), pnpmWorkspaceDir)

  print(options, config, 'verbose')

  return config
})

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls for completeness
  // this should never happen since list is only called in runGlobal -> getInstalledPackages
  if (!options.global) return npmList(options)

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

export const distTag = withNpmWorkspaceConfig(npmDistTag)
export const greatest = withNpmWorkspaceConfig(npmGreatest)
export const latest = withNpmWorkspaceConfig(npmLatest)
export const minor = withNpmWorkspaceConfig(npmMinor)
export const newest = withNpmWorkspaceConfig(npmNewest)
export const patch = withNpmWorkspaceConfig(npmPatch)
export const semver = withNpmWorkspaceConfig(npmPatch)

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

export { defaultPrefix, getPeerDependencies, packageAuthorChanged } from './npm.js'
