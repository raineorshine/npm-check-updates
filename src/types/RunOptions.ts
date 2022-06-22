/** This file is generated automatically from the options specified in /src/cli-options.ts. Do not edit manually. Run "npm run build:options" to build. */

import { FilterFunction } from './FilterFunction'
import { PackageFile } from './PackageFile'
import { TargetFunction } from './TargetFunction'

/** Options that can be given on the CLI or passed to the ncu module to control all behavior. */
export interface RunOptions {
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

  /** Iteratively installs upgrades and runs tests to identify breaking upgrades. Run "ncu --doctor" for detailed help. Add "-u" to execute. */
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

  /** Enable additional output data, string or comma-delimited list: ownerChanged, repo. ownerChanged: shows if the package owner changed between versions. repo: infers and displays links to source code repository. */
  format?: string[]

  /** Check global packages instead of in the current project. */
  global?: boolean

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

  /** npm, yarn, staticRegistry (default: "npm") */
  packageManager?: string

  /** Check peer dependencies of installed packages and filter updates to compatible versions. Run "ncu --help --peer" for details. */
  peer?: boolean

  /** Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1) */
  pre?: boolean

  /** Current working directory of npm. */
  prefix?: string

  /** Third-party npm registry. */
  registry?: string

  /** Exclude packages matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function. */
  reject?: string | string[] | RegExp | RegExp[] | FilterFunction

  /** Exclude package.json versions using comma-or-space-delimited list, /regex/, or predicate function. */
  rejectVersion?: string | string[] | RegExp | RegExp[] | FilterFunction

  /** Remove version ranges from the final package version. */
  removeRange?: boolean

  /** Number of times to retry failed requests for package info. (default: 3) */
  retry?: number

  /** Don't output anything (--loglevel silent). */
  silent?: boolean

  /** Read package.json from stdin. */
  stdin?: string

  /** Determines the version to upgrade to: latest, newest, greatest, minor, patch, @[tag], or [function]. Run "ncu --help --target" for details. (default: "latest") */
  target?: 'latest' | 'newest' | 'greatest' | 'minor' | 'patch' | `@${string}` | TargetFunction

  /** Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registry-fetch) */
  timeout?: number

  /** Overwrite package file with upgraded versions instead of just outputting to console. */
  upgrade?: boolean
}
