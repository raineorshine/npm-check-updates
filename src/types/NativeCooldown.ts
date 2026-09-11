/** A package manager's own cooldown / minimum release age setting, normalized for ncu's --cooldown. */
export interface NativeCooldown {
  /** Cooldown period in days. */
  days: number
  /** Package names or glob patterns exempt from the cooldown. */
  exclude: string[]
  /** Where the setting came from, e.g. "minimumReleaseAge from pnpm-workspace.yaml". Used in the log message. */
  source: string
  /** Singular noun for an exclude entry, e.g. "excluded pattern". Used in the log message. */
  excludeLabel: string
  /** Builds the matcher for an exclude pattern, when the package manager does not use plain globs. */
  createMatcher?: (pattern: string) => (packageName: string) => boolean
}
