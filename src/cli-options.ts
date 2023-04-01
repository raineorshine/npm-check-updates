import Table from 'cli-table3'
import sortBy from 'lodash/sortBy'
import path from 'path'
import { defaultCacheFile } from './lib/cache'
import chalk from './lib/chalk'
import { Index } from './types/IndexType'

export interface CLIOption<T = any> {
  arg?: string
  choices?: T[]
  default?: T
  deprecated?: boolean
  description: string
  help?: string | (() => string)
  parse?: (s: string, p?: T) => T
  long: string
  short?: string
  type: string
}

/** Pads the left side of each line in a string. */
const padLeft = (s: string, n: number) =>
  s
    .split('\n')
    .map(line => `${''.padStart(n, ' ')}${line}`)
    .join('\n')

/** Renders the extended help for an option with usage information. */
export const renderExtendedHelp = (option: CLIOption): string => {
  let output = `Usage:

    ncu --${option.long}${option.arg ? ` [${option.arg}]` : ''}\n`
  if (option.short) {
    output += `    ncu -${option.short}${option.arg ? ` [${option.arg}]` : ''}\n`
  }
  if (option.default !== undefined && !(Array.isArray(option.default) && option.default.length === 0)) {
    output += `Default: ${option.default}\n`
  }
  if (option.help) {
    const helpText = typeof option.help === 'function' ? option.help() : option.help
    output += `\n${helpText.trim()}\n\n`
  } else if (option.description) {
    output += `\n${option.description}\n`
  }

  return output.trim()
}

/** Wraps a string by inserting newlines every n characters. Wraps on word break. Default: 92 chars. */
const wrap = (s: string, maxLineLength = 92) => {
  /* eslint-disable fp/no-mutating-methods */
  const linesIn = s.split('\n')
  const linesOut: string[] = []
  linesIn.forEach(lineIn => {
    let i = 0
    if (lineIn.length === 0) {
      linesOut.push('')
      return
    }

    // eslint-disable-next-line fp/no-loops
    while (i < lineIn.length) {
      const lineFull = lineIn.slice(i, i + maxLineLength + 1)

      // if the line is within the line length, push it as the last line and break
      const lineTrimmed = lineFull.trimEnd()
      if (lineTrimmed.length <= maxLineLength) {
        linesOut.push(lineTrimmed)
        break
      }

      // otherwise, wrap before the last word that exceeds the wrap length
      // do not wrap in the middle of a word
      // reverse the string and use match to find the first non-word character to wrap on
      const wrapOffset =
        lineFull
          .split('')
          .reverse()
          .join('')
          // add [^\W] to not break in the middle of --registry
          .match(/[ -][^\W]/)?.index || 0
      const line = lineFull.slice(0, lineFull.length - wrapOffset)

      // make sure we do not end up in an infinite loop
      if (line.length === 0) break

      linesOut.push(line.trimEnd())
      i += line.length
    }
    i = 0
  })
  return linesOut.join('\n').trim()
}

/** Wraps the second column in a list of 2-column cli-table rows. */
const wrapRows = (rows: string[][]) => rows.map(([col1, col2]) => [col1, wrap(col2)])

/** Extended help for the --doctor option. */
const extendedHelpDoctor =
  () => `Iteratively installs upgrades and runs tests to identify breaking upgrades. Reverts broken upgrades and updates package.json with working upgrades.

${chalk.yellow('Add "-u" to execute')} (modifies your package file, lock file, and node_modules)

To be more precise:

1. Runs "npm install" and "npm test" to ensure tests are currently passing.
2. Runs "ncu -u" to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. Prints broken upgrades with test error.
7. Saves working upgrades to package.json.

Additional options:

    ${chalk.cyan('--doctorInstall')}   specify a custom install script (default: "npm install" or "yarn")
    ${chalk.cyan('--doctorTest')}      specify a custom test script (default: "npm test")

Example:

    $ ncu --doctor -u
    Running tests before upgrading
    npm install
    npm run test
    Upgrading all dependencies and re-running tests
    ncu -u
    npm install
    npm run test
    Tests failed
    Identifying broken dependencies
    npm install
    npm install --no-save react@16.0.0
    npm run test
      ✓ react 15.0.0 → 16.0.0
    npm install --no-save react-redux@7.0.0
    npm run test
      ✗ react-redux 6.0.0 → 7.0.0

    /projects/myproject/test.js:13
      throw new Error('Test failed!')
      ^

    npm install --no-save react-dnd@11.1.3
    npm run test
      ✓ react-dnd 10.0.0 → 11.1.3
    Saving partially upgraded package.json
`

/** Extended help for the filterResults option. */
const extendedHelpFilterResults = (): string => {
  return `Filters the results of update based on user provided function. Only available in .ncurc.js or when importing npm-check-updates as a module:

    ${chalk.gray(`/**
      @param {string} packageName                 The name of the dependency.
      @param {VersionSpec} currentVersion         Current version declaration (may be range)
      @param {SemVer[]} currentVersionSemver      Current version declaration in semantic versioning format (may be range)
      @param {Version} upgradedVersion            Upgraded version declaration (may be range)
      @param {SemVer} upgradedVersionSemver       Upgraded version declaration in semantic versioning format (may be range)
      @returns {boolean}                          Return true if the upgrade should be kept, otherwise it will be ignored.
    */`)}
    ${chalk.cyan(
      'filterResults',
    )}: (packageName, {currentVersion, currentVersionSemver, upgradedVersion, upgradedVersionSemver}) {
      const currentMajorVersion = currentVersionSemver && currentVersionSemver[0] && currentVersionSemver[0].major
      const upgradedMajorVersion = upgradedVersionSemver && upgradedVersionSemver.major
      if (currentMajorVersion && upgradedMajorVersion) {
        return currentMajorVersion < upgradedMajorVersion
      }
      return true
    }
`
}

/** Extended help for the --format option. */
const extendedHelpFormat = (): string => {
  const header =
    'Modify the output formatting or show additional information. Specify one or more comma-delimited values.'
  const table = new Table({ colAligns: ['right', 'left'] })
  table.push(
    ...wrapRows([
      ['group', `Groups packages by major, minor, patch, and major version zero updates.`],
      ['ownerChanged', `Shows if the package owner has changed.`],
      ['repo', `Infers and displays links to the package's source code repository. Requires packages to be installed.`],
      ['time', 'Shows the publish time of each upgrade.'],
      ['lines', 'Prints name@version on separate lines. Useful for piping to npm install.'],
    ]),
  )

  return `${header}\n\n${padLeft(table.toString(), 4)}
`
}

/** Extended help for the --group option. */
const extendedHelpGroup = (): string => {
  return `Customize how packages are divided into groups when using '--format group'. Only available in .ncurc.js or when importing npm-check-updates as a module:

    ${chalk.gray(`/**
      @param name             The name of the dependency.
      @param defaultGroup     The predefined group name which will be used by default.
      @param currentSpec      The current version range in your package.json.
      @param upgradedSpec     The upgraded version range that will be written to your package.json.
      @param upgradedVersion  The upgraded version number returned by the registry.
      @returns                A predefined group name ('major' | 'minor' | 'patch' | 'majorVersionZero' | 'none') or a custom string to create your own group.
    */`)}
    ${chalk.cyan('groupFunction')}: (name, defaultGroup, currentSpec, upgradedSpec, upgradedVersion} {
      if (name === 'typescript' && defaultGroup === 'minor') {
        return 'major'
      }
      if (name.startsWith('@myorg/')) {
        return 'My Org'
      }
      return defaultGroup
    }
`
}

/** Extended help for the --target option. */
const extendedHelpTarget = (): string => {
  const header = 'Determines the version to upgrade to. (default: "latest")'
  const table = new Table({ colAligns: ['right', 'left'] })
  table.push(
    ...wrapRows([
      [
        'greatest',
        `Upgrade to the highest version number published, regardless of release date or tag. Includes prereleases.`,
      ],
      ['latest', `Upgrade to whatever the package's "latest" git tag points to. Excludes pre is specified.`],
      ['minor', 'Upgrade to the highest minor version without bumping the major version.'],
      [
        'newest',
        `Upgrade to the version with the most recent publish date, even if there are other version numbers that are higher. Includes prereleases.`,
      ],
      ['patch', `Upgrade to the highest patch version without bumping the minor or major versions.`],
      ['@[tag]', `Upgrade to the version published to a specific tag, e.g. 'next' or 'beta'.`],
    ]),
  )

  return `${header}

${padLeft(table.toString(), 4)}

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates as a module:

    ${chalk.gray(`/** Custom target.
      @param dependencyName The name of the dependency.
      @param parsedVersion A parsed Semver object from semver-utils.
        (See https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
      @returns One of the valid target values (specified in the table above).
    */`)}
    ${chalk.cyan(
      'target',
    )}: (dependencyName, [{ semver, version, operator, major, minor, patch, release, build }]) ${chalk.cyan('=>')} {
      ${chalk.red('if')} (major ${chalk.red('===')} ${chalk.blue("'0'")}) ${chalk.red('return')} ${chalk.yellow(
    "'minor'",
  )}
      ${chalk.red('return')} ${chalk.yellow("'latest'")}
    }
`
}

/** Extended help for the --format option. */
const extendedHelpPackageManager = (): string => {
  const header = 'Specifies the package manager to use when looking up version numbers.'
  const table = new Table({ colAligns: ['right', 'left'] })
  table.push(
    ...wrapRows([
      ['npm', `System-installed npm. Default.`],
      ['yarn', `System-installed yarn. Automatically used if yarn.lock is present.`],
      ['pnpm', `System-installed pnpm. Automatically used if pnpm-lock.yaml is present.`],
      [
        'staticRegistry',
        `Checks versions from a static file. Must include the --registry option with the path to a JSON registry file.

Example:

    ${chalk.cyan('$')} ncu --packageManager staticRegistry --registry ./my-registry.json

my-registry.json:

    {
      "prettier": "2.7.1",
      "typescript": "4.7.4"
    }
      `,
      ],
    ]),
  )

  return `${header}\n\n${padLeft(table.toString(), 4)}
`
}

/** Extended help for the --peer option. */
const extendedHelpPeer = () => `Check peer dependencies of installed packages and filter updates to compatible versions.

${chalk.bold('Example')}:

The following example demonstrates how --peer works, and how it uses peer dependencies from upgraded modules.

The package ${chalk.bold('ncu-test-peer-update')} has two versions published:

- 1.0.0 has peer dependency "ncu-test-return-version": "1.0.x"
- 1.1.0 has peer dependency "ncu-test-return-version": "1.1.x"

Our test app has the following dependencies:

    "ncu-test-peer-update": "1.0.0",
    "ncu-test-return-version": "1.0.0"

The latest versions of these packages are:

    "ncu-test-peer-update": "1.1.0",
    "ncu-test-return-version": "2.0.0"

${chalk.bold('With --peer')}:

ncu upgrades packages to the highest version that still adheres to the peer dependency constraints:

    ncu-test-peer-update     1.0.0  →  1.${chalk.cyan('1.0')}
    ncu-test-return-version  1.0.0  →  1.${chalk.cyan('1.0')}

${chalk.bold('Without --peer')}:

As a comparison: without using the --peer option, ncu will suggest the latest versions, ignoring peer dependencies:

    ncu-test-peer-update     1.0.0  →  1.${chalk.cyan('1.0')}
    ncu-test-return-version  1.0.0  →  ${chalk.red('2.0.0')}
`

// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions: CLIOption[] = [
  {
    long: 'cache',
    description: `Cache versions to a local cache file. Default --cacheFile is ${defaultCacheFile} and default --cacheExpiration is 10 minutes.`,
    type: 'boolean',
  },
  {
    long: 'cacheClear',
    description: 'Clear the default cache, or the cache file specified by --cacheFile.',
    type: 'boolean',
  },
  {
    long: 'cacheExpiration',
    arg: 'min',
    description: 'Cache expiration in minutes. Only works with --cache.',
    parse: s => parseInt(s, 10),
    default: 10,
    type: 'number',
  },
  {
    long: 'cacheFile',
    arg: 'path',
    description: 'Filepath for the cache file. Only works with --cache.',
    parse: s => (path.isAbsolute(s) ? s : path.join(process.cwd(), s)),
    default: defaultCacheFile,
    type: 'string',
  },
  {
    long: 'color',
    description: 'Force color in terminal.',
    type: 'boolean',
  },
  {
    long: 'concurrency',
    arg: 'n',
    description: 'Max number of concurrent HTTP requests to registry.',
    parse: s => parseInt(s, 10),
    default: 8,
    type: 'number',
  },
  {
    long: 'configFileName',
    arg: 's',
    description: 'Config file name. (default: .ncurc.{json,yml,js,cjs})',
    type: 'string',
  },
  {
    long: 'configFilePath',
    arg: 'path',
    description: 'Directory of .ncurc config file. (default: directory of `packageFile`)',
    type: 'string',
  },
  {
    long: 'cwd',
    arg: 'path',
    description: 'Working directory in which npm will be executed.',
    type: 'string',
  },
  {
    long: 'deep',
    description: `Run recursively in current working directory. Alias of (--packageFile '**/package.json').`,
    type: 'boolean',
  },
  {
    long: 'dep',
    arg: 'value',
    description:
      'Check one or more sections of dependencies only: dev, optional, peer, prod, or packageManager (comma-delimited).',
    default: ['prod', 'dev', 'optional'],
    parse: value => (value && typeof value === 'string' ? value.split(',') : value),
    type: 'string | string[]',
  },
  {
    long: 'deprecated',
    description: 'Include deprecated packages.',
    type: 'boolean',
  },
  {
    long: 'doctor',
    short: 'd',
    description:
      'Iteratively installs upgrades and runs tests to identify breaking upgrades. Requires "-u" to execute.',
    type: 'boolean',
    help: extendedHelpDoctor,
  },
  {
    long: 'doctorInstall',
    arg: 'command',
    description: 'Specifies the install script to use in doctor mode. (default: npm install/yarn)',
    type: 'string',
  },
  {
    long: 'doctorTest',
    arg: 'command',
    description: 'Specifies the test script to use in doctor mode. (default: npm test)',
    type: 'string',
  },
  {
    long: 'enginesNode',
    description: 'Include only packages that satisfy engines.node as specified in the package file.',
    type: 'boolean',
  },
  {
    long: 'errorLevel',
    short: 'e',
    arg: 'n',
    description:
      'Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration).',
    parse: s => parseInt(s, 10),
    default: 1,
    type: 'number',
  },
  {
    long: 'filter',
    short: 'f',
    arg: 'p',
    description:
      'Include only package names matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
  },
  {
    long: 'filterResults',
    arg: 'fn',
    description: `Filters the results of update based on user provided function.`,
    type: 'FilterResultsFunction',
    help: extendedHelpFilterResults,
  },
  {
    long: 'filterVersion',
    arg: 'p',
    description: 'Filter on package version using comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
  },
  {
    long: 'format',
    arg: 'value',
    description:
      'Modify the output formatting or show additional information. Specify one or more comma-delimited values: group, ownerChanged, repo, time, lines.',
    parse: value => (typeof value === 'string' ? value.split(',') : value),
    default: [],
    type: 'string[]',
    choices: ['group', 'ownerChanged', 'repo', 'time', 'lines'],
    help: extendedHelpFormat,
  },
  {
    long: 'global',
    short: 'g',
    description: 'Check global packages instead of in the current project.',
    type: 'boolean',
  },
  {
    long: 'groupFunction',
    arg: 'fn',
    description: `Customize how packages are divided into groups when using '--format group'.`,
    type: 'GroupFunction',
    help: extendedHelpGroup,
  },
  {
    long: 'interactive',
    short: 'i',
    description: 'Enable interactive prompts for each dependency; implies -u unless one of the json options are set.',
    type: 'boolean',
  },
  {
    // program.json is set to true in programInit if any options that begin with 'json' are true
    long: 'jsonAll',
    short: 'j',
    description: 'Output new package file instead of human-readable message.',
    type: 'boolean',
  },
  {
    long: 'jsonDeps',
    description:
      'Like `jsonAll` but only lists `dependencies`, `devDependencies`, `optionalDependencies`, etc of the new package data.',
    type: 'boolean',
  },
  {
    long: 'jsonUpgraded',
    description: 'Output upgraded dependencies in json.',
    type: 'boolean',
  },
  {
    long: 'loglevel',
    short: 'l',
    arg: 'n',
    description: 'Amount to log: silent, error, minimal, warn, info, verbose, silly.',
    default: 'warn',
    type: 'string',
  },
  {
    long: 'mergeConfig',
    description: `Merges nested configs with the root config file for --deep or --packageFile options. (default: false)`,
    type: 'boolean',
  },
  {
    long: 'minimal',
    short: 'm',
    description: 'Do not upgrade newer versions that are already satisfied by the version range according to semver.',
    type: 'boolean',
  },
  {
    long: 'packageData',
    arg: 'value',
    description: 'Package file data (you can also use stdin).',
    type: 'string | PackageFile',
  },
  {
    long: 'packageFile',
    arg: 'path|glob',
    description: 'Package file(s) location. (default: ./package.json)',
    type: 'string',
  },
  {
    long: 'packageManager',
    short: 'p',
    arg: 's',
    description: 'npm, yarn, pnpm, deno, staticRegistry (default: npm).',
    help: extendedHelpPackageManager,
    type: `'npm' | 'yarn' | 'pnpm' | 'deno' | 'staticRegistry'`,
  },
  {
    long: 'peer',
    description: 'Check peer dependencies of installed packages and filter updates to compatible versions.',
    type: 'boolean',
    help: extendedHelpPeer,
  },
  {
    long: 'pre',
    arg: 'n',
    description:
      'Include prerelease versions, e.g. -alpha.0, -beta.5, -rc.2. Automatically set to 1 when --target is newest or greatest, or when the current version is a prerelease. (default: 0)',
    parse: s => !!parseInt(s, 10),
    type: 'number',
  },
  {
    long: 'prefix',
    arg: 'path',
    description: 'Current working directory of npm.',
    type: 'string',
  },
  {
    long: 'registry',
    short: 'r',
    arg: 'uri',
    description: 'Third-party npm registry.',
    help: wrap(`Specify the registry to use when looking up package version numbers.

When --packageManager staticRegistry is set, --registry must specify a path to a JSON registry file.`),
    type: 'string',
  },
  {
    long: 'reject',
    short: 'x',
    arg: 'p',
    description:
      'Exclude packages matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
  },
  {
    long: 'rejectVersion',
    arg: 'p',
    description: 'Exclude package.json versions using comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
  },
  {
    long: 'removeRange',
    description: 'Remove version ranges from the final package version.',
    type: 'boolean',
  },
  {
    long: 'root',
    description:
      'Runs updates on the root project in addition to specified workspaces. Only allowed with --workspace or --workspaces. (default: false)',
    type: 'boolean',
  },
  {
    long: 'retry',
    arg: 'n',
    description: 'Number of times to retry failed requests for package info.',
    parse: s => parseInt(s, 10),
    default: 3,
    type: 'number',
  },
  {
    long: 'silent',
    short: 's',
    description: "Don't output anything. Alias for --loglevel silent.",
    type: 'boolean',
  },
  {
    long: 'stdin',
    description: 'Read package.json from stdin.',
    type: 'string',
  },
  {
    long: 'target',
    short: 't',
    arg: 'value',
    description:
      'Determines the version to upgrade to: latest, newest, greatest, minor, patch, @[tag], or [function]. (default: latest)',
    help: extendedHelpTarget,
    // eslint-disable-next-line no-template-curly-in-string
    type: `'latest' | 'newest' | 'greatest' | 'minor' | 'patch' | ${'`@${string}`'} | TargetFunction`,
  },
  {
    long: 'timeout',
    arg: 'ms',
    description: 'Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registry-fetch)',
    type: 'number',
  },
  {
    long: 'upgrade',
    short: 'u',
    description: 'Overwrite package file with upgraded versions instead of just outputting to console.',
    type: 'boolean',
  },
  {
    long: 'verbose',
    description: 'Log additional information for debugging. Alias for --loglevel verbose.',
    type: 'boolean',
  },
  {
    long: 'workspace',
    short: 'w',
    arg: 's',
    parse: (value, accum) => [...accum, value],
    default: [],
    description: 'Run on one or more specified workspaces. Add --root to also upgrade the root project.',
    type: 'string[]',
  },
  {
    long: 'workspaces',
    short: 'ws',
    description: 'Run on all workspaces. Add --root to also upgrade the root project.',
    type: 'boolean',
  },
]

// put cliOptions into an object for O(1) lookups
export const cliOptionsMap = cliOptions.reduce(
  (accum, option) => ({
    ...accum,
    ...(option.short ? { [option.short]: option } : null),
    ...(option.long ? { [option.long]: option } : null),
  }),
  {} as Index<CLIOption>,
)

const cliOptionsSorted = sortBy(cliOptions, 'long')

export default cliOptionsSorted
