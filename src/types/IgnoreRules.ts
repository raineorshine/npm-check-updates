/** A rule for one `ignore` entry: a semver range of versions to hold back, or the range with an optional human-readable reason. */
export type IgnoreRule = string | { versions: string; reason?: string }

/** Maps package names or globs to versions that ncu should never suggest. */
export interface IgnoreRules {
  [packageNameOrGlob: string]: IgnoreRule
}
