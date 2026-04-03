import memoize from 'fast-memoize'
import findUp from 'find-up'
import fs from 'fs/promises'
import ini from 'ini'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import keyValueBy from '../lib/keyValueBy'
import { print } from '../lib/logging'
import spawnCommand from '../lib/spawnCommand'
import { GetVersion } from '../types/GetVersion'
import { Index } from '../types/IndexType'
import { NpmConfig } from '../types/NpmConfig'
import { NpmOptions } from '../types/NpmOptions'
import { Options } from '../types/Options'
import { SpawnOptions } from '../types/SpawnOptions'
import { SpawnPleaseOptions } from '../types/SpawnPleaseOptions'
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

/** Shape of the pnpm-workspace.yaml minimumReleaseAge settings. */
export interface PnpmWorkspaceMinimumReleaseAge {
  /** Minimum release age in minutes (pnpm's native unit). */
  minimumReleaseAge: number
  /** List of package name glob patterns excluded from the minimum release age constraint. */
  minimumReleaseAgeExclude: string[]
}

/** Reads minimumReleaseAge settings from pnpm-workspace.yaml if present. */
export const getPnpmWorkspaceMinimumReleaseAge = memoize(async (): Promise<PnpmWorkspaceMinimumReleaseAge | null> => {
  const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml')
  if (!pnpmWorkspacePath) return null

  let content: string
  try {
    content = await fs.readFile(pnpmWorkspacePath, 'utf-8')
  } catch {
    return null
  }

  let parsed: Record<string, unknown>
  try {
    parsed = parseYaml(content) ?? {}
  } catch {
    return null
  }

  const minimumReleaseAge = parsed.minimumReleaseAge
  if (typeof minimumReleaseAge !== 'number' || isNaN(minimumReleaseAge) || minimumReleaseAge < 0) return null

  const rawExclude = parsed.minimumReleaseAgeExclude
  const minimumReleaseAgeExclude: string[] = Array.isArray(rawExclude)
    ? rawExclude.filter((x): x is string => typeof x === 'string')
    : []

  return { minimumReleaseAge, minimumReleaseAgeExclude }
})

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls for completeness
  // this should never happen since list is only called in runGlobal -> getInstalledPackages
  if (!options.global) return npm.list(options)

  const { stdout } = await spawnCommand('pnpm', ['ls', '-g', '--json'])
  const result = JSON.parse(stdout) as PnpmList
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
async function spawnPnpm(
  args: string | string[],
  npmOptions: NpmOptions = {},
  spawnOptions?: SpawnOptions,
  spawnPleaseOptions?: SpawnPleaseOptions,
): Promise<string> {
  const fullArgs = [
    ...(npmOptions.global ? 'global' : []),
    ...(Array.isArray(args) ? args : [args]),
    ...(npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : []),
  ]

  const { stdout } = await spawnCommand('pnpm', fullArgs, spawnPleaseOptions, spawnOptions)

  return stdout
}

export { defaultPrefix, getPeerDependencies, getEngines, packageAuthorChanged } from './npm'

export default spawnPnpm
