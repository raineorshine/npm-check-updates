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
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import {
  normalizeNpmConfig,
  distTag as npmDistTag,
  greatest as npmGreatest,
  latest as npmLatest,
  list as npmList,
  minor as npmMinor,
  newest as npmNewest,
  patch as npmPatch,
} from './npm'

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
  const pnpmWorkspaceConfigPath = path.join(path.dirname(pnpmWorkspacePath), '.npmrc')
  let pnpmWorkspaceConfig
  try {
    pnpmWorkspaceConfig = await fs.readFile(pnpmWorkspaceConfigPath, 'utf-8')
  } catch (e) {
    return {}
  }

  print(options, `\nUsing pnpm workspace config at ${pnpmWorkspaceConfigPath}:`, 'verbose')

  const config = normalizeNpmConfig(ini.parse(pnpmWorkspaceConfig))

  print(options, config, 'verbose')

  return config
})

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls
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
    getVersion(packageName, currentVersion, options, await npmConfigFromPnpmWorkspace(options))

export const distTag = withNpmWorkspaceConfig(npmDistTag)
export const greatest = withNpmWorkspaceConfig(npmGreatest)
export const latest = withNpmWorkspaceConfig(npmLatest)
export const minor = withNpmWorkspaceConfig(npmMinor)
export const newest = withNpmWorkspaceConfig(npmNewest)
export const patch = withNpmWorkspaceConfig(npmPatch)

export { defaultPrefix, getPeerDependencies, packageAuthorChanged } from './npm'