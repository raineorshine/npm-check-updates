/** The semver level by which a package is being upgraded, used to group packages with `--format group`. */
export type UpgradeGroup = 'major' | 'minor' | 'patch' | 'majorVersionZero' | 'none'
