/** This file is generated automatically from the options specified in /src/cli-options.ts. Do not edit manually. Run "npm run build:options" to build. */
import { FilterFetchedFunction } from './FilterFetchedFunction'
import { FilterFunction } from './FilterFunction'
import { GroupFunction } from './GroupFunction'
import { PackageFile } from './PackageFile'
import { TargetFunction } from './TargetFunction'

/** Options that can be given on the CLI or passed to the ncu module to control all behavior. */
export interface RunOptions {
  /** Cache versions to the cache file */
  cache?: boolean

  /** Clear the default cache, or the cache file specified by --cacheFile */
  cacheClear?: boolean

  /** Cache expiration in minutes (default: 10) */
  cacheExpiration?: number

  /** Filepath for the cache file (default: "~/.ncu-cache.json") */
  cacheFile?: string

  /** Force color in terminal */
  color?: boolean

  /** Max number of concurrent HTTP requests to registry. (default: 8) */
  concurrency?: number

  /** Config file name. (default: .ncurc.{json,yml,js}) */
  configFileName?: string

  /** Directory of .ncurc config file. (default: directory of `packageFile`) */
  configFilePath?: string

  /** Working directory in which npm will be executed. */
  cwd?: string

  /** Run recursively in current working directory. Alias of (--packageFile '**\/package.json'). */
  deep?: boolean

  /** Check one or more sections of dependencies only: dev, optional, peer, prod, bundle (comma-delimited). (default: "prod,dev,bundle,optional") */
  dep?: string

  /** Include deprecated packages. */
  deprecated?: boolean

  /** Iteratively installs upgrades and runs tests to identify breaking upgrades. Requires "-u" to execute. Run "ncu --help --doctor" for details. */
  doctor?: boolean

  /** Specifies the install script to use in doctor mode. (default: npm install/yarn) */
  doctorInstall?: string

  /** Specifies the test script to use in doctor mode. (default: npm test) */
  doctorTest?: string

  /** Include only packages that satisfy engines.node as specified in the package file. */
  enginesNode?: boolean

  /** Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration). (default: 1) */
  errorLevel?: number

  /** Include only package names matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function. */
  filter?: string | string[] | RegExp | RegExp[] | FilterFunction

  /** Filter on package version using comma-or-space-delimited list, /regex/, or predicate function. */
  filterVersion?: string | string[] | RegExp | RegExp[] | FilterFunction

  /** Filter on Packument using predicate function. */
  filterFetched?: FilterFetchedFunction

  /** Modify the output formatting or show additional information. Specify one or more comma-delimited values: group, ownerChanged, repo. Run "ncu --help --format" for details. */
  format?: string[]

  /** Check global packages instead of in the current project. */
  global?: boolean

  /** Customize how packages are divided into groups when using '--format group'. Run "ncu --help --groupFunction" for details. */
  groupFunction?: GroupFunction

  /** Enable interactive prompts for each dependency; implies -u unless one of the json options are set. */
  interactive?: boolean

  /** Output new package file instead of human-readable message. */
  jsonAll?: boolean

  /** Like `jsonAll` but only lists `dependencies`, `devDependencies`, `optionalDependencies`, etc of the new package data. */
  jsonDeps?: boolean

  /** Output upgraded dependencies in json. */
  jsonUpgraded?: boolean

  /** Amount to log: silent, error, minimal, warn, info, verbose, silly. (default: "warn") */
  loglevel?: string

  /** Merges nested configs with the root config file for --deep or --packageFile options. (default: false) */
  mergeConfig?: boolean

  /** Do not upgrade newer versions that are already satisfied by the version range according to semver. */
  minimal?: boolean

  /** Package file data (you can also use stdin). */
  packageData?: string | PackageFile

  /** Package file(s) location. (default: ./package.json) */
  packageFile?: string

  /** npm, yarn, staticRegistry (default: npm). Run "ncu --help --packageManager" for details. */
  packageManager?: string

  /** Check peer dependencies of installed packages and filter updates to compatible versions. Run "ncu --help --peer" for details. */
  peer?: boolean

  /** Include prerelease versions, e.g. -alpha.0, -beta.5, -rc.2. Automatically set to 1 when --target is newest or greatest, or when the current version is a prerelease. (default: 0) */
  pre?: boolean

  /** Current working directory of npm. */
  prefix?: string

  /** Third-party npm registry. Run "ncu --help --registry" for details. */
  registry?: string

  /** Exclude packages matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function. */
  reject?: string | string[] | RegExp | RegExp[] | FilterFunction

  /** Exclude package.json versions using comma-or-space-delimited list, /regex/, or predicate function. */
  rejectVersion?: string | string[] | RegExp | RegExp[] | FilterFunction

  /** Remove version ranges from the final package version. */
  removeRange?: boolean

  /** Number of times to retry failed requests for package info. (default: 3) */
  retry?: number

  /** Runs updates on the root project in addition to specified workspaces. Only allowed with --workspace or --workspaces. (default: false) */
  root?: boolean

  /** Don't output anything. Alias for --loglevel silent. */
  silent?: boolean

  /** Read package.json from stdin. */
  stdin?: string

  /** Determines the version to upgrade to: latest, newest, greatest, minor, patch, @[tag], or [function]. (default: latest) Run "ncu --help --target" for details. */
  target?: 'latest' | 'newest' | 'greatest' | 'minor' | 'patch' | `@${string}` | TargetFunction

  /** Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registry-fetch) */
  timeout?: number

  /** Overwrite package file with upgraded versions instead of just outputting to console. */
  upgrade?: boolean

  /** Log additional information for debugging. Alias for --loglevel verbose. */
  verbose?: boolean

  /** Run on one or more specified workspaces. Add --root to also upgrade the root project. */
  workspace?: string[]

  /** Run on all workspaces. Add --root to also upgrade the root project. */
  workspaces?: boolean
}
