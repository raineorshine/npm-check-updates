// Redeclared rather than re-exported from the semver-utils types so consumers do not need them installed.
/** A version or version range component parsed by semver-utils. */
export interface SemVer {
  semver?: string | undefined
  version?: string | undefined
  major?: string | undefined
  minor?: string | undefined
  patch?: string | undefined
  release?: string | undefined
  build?: string | undefined
  operator?: string | undefined
}
