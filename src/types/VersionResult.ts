import { type Version } from './Version.ts'

export interface CooldownInfo {
  name: string
  currentVersion: string
  currentVersionTime?: string
  version: string | null | undefined
  time?: string
  fallbackVersion?: string | null
}

/** A version that an ignore rule held back. */
export interface IgnoreInfo {
  name: string
  currentVersion: string
  version: string
  time?: string
  /** The distinct reasons of every rule that matched, joined with "; ". */
  reason?: string
}

/** The result of fetching a version from the package manager, which may include an error. Used to pass errors back up the call chain for better reporting. */
export interface VersionResult {
  version?: Version | null
  error?: string
  time?: string
  /** Set only if the package was skipped due to cooldown. */
  cooldownInfo?: CooldownInfo
  /** Set only if an ignore rule held back a version above the one chosen. */
  ignoreInfo?: IgnoreInfo
}
