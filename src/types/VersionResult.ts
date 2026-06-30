import { type Version } from './Version.ts'

export interface CooldownInfo {
  name: string
  currentVersion: string
  currentVersionTime?: string
  version: string | null | undefined
  time?: string
  fallbackVersion?: string | null
}

/** The result of fetching a version from the package manager, which may include an error. Used to pass errors back up the call chain for better reporting. */
export interface VersionResult {
  version?: Version | null
  error?: string
  time?: string
  /** Set only if the package was skipped due to cooldown. */
  cooldownInfo?: CooldownInfo
}
