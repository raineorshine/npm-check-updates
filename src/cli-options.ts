import _ from 'lodash'
import Table from 'cli-table'
import chalk from 'chalk'
import { Index } from './types/IndexType'

export interface CLIOption<T = any> {
  arg?: string
  choices?: T[]
  default?: T
  deprecated?: boolean
  description: string
  help?: string
  parse?: (s: string, p?: T) => T
  long: string
  short?: string
  type: string
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

/** Extended help for the --target option. */
const extendedHelpTarget = (): string => {
  const header = 'Determines the version to upgrade to. (default: "latest")'
  const table = new Table({
    colAligns: ['right', 'left'],
    rows: wrapRows([
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
    // coerce type until rows is added @types/cli-table
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/cli-table/index.d.ts
  } as any)

  return `${header}

${table.toString()}

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates:

  ${chalk.gray(`/** Custom target.
    @param dependencyName The name of the dependency.
    @param parsedVersion A parsed Semver object from semver-utils.
      (See https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
    @returns One of the valid target values (specified in the table above).
  */`)}
  ${chalk.cyan(
    'target',
  )}: (dependencyName, [{ semver, version, operator, major, minor, patch, release, build }]) ${chalk.cyan('=>')} {
    ${chalk.red('if')} (major ${chalk.red('===')} ${chalk.blue("'0'")}) ${chalk.red('return')} ${chalk.yellow("'minor'")}
    ${chalk.red('return')} ${chalk.yellow("'latest'")}
  }

`
}

/** Extended help for the --format option. */
const extendedHelpFormat = (): string => {
  const header =
    'Modify the output formatting or show additional information. Specify one or more comma-delimited values.'
  const table = new Table({
    colAligns: ['right', 'left'],
    rows: wrapRows([
      ['group', `Groups packages by major, minor, patch, and non-semver updates.`],
      ['ownerChanged', `Shows if the package owner has changed.`],
      ['repo', `Infers and displays links to the package's source code repository.`],
    ]),
    // coerce type until rows is added @types/cli-table
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/cli-table/index.d.ts
  } as any)

  return `${header}\n\n${table.toString()}
`
}

/** Extended help for the --format option. */
const extendedHelpPackageManager = (): string => {
  const header = 'Specifies the package manager to use when looking up version numbers.'
  const table = new Table({
    colAligns: ['right', 'left'],
    rows: wrapRows([
      ['npm', `System-installed npm. Default.`],
      ['yarn', `System-installed yarn. Automatically used if yarn.lock is present.`],
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
    // coerce type until rows is added @types/cli-table
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/cli-table/index.d.ts
  } as any)

  return `${header}\n\n${table.toString()}
`
}

/** Extended help for the --doctor option. */
const extendedHelpDoctor = () => `Iteratively installs upgrades and runs tests to identify breaking upgrades.

${chalk.bold('Add "-u" to execute')} (modifies your package file, lock file, and node_modules)

To be more precise:
1. Runs "npm install" and "npm test" to ensure tests are currently passing.
2. Runs "ncu -u" to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. Prints broken upgrades with test error.
7. Saves working upgrades to package.json.

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

// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions: CLIOption[] = [
  {
    long: 'color',
    description: 'Force color in terminal',
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
    arg: 'filename',
    description: 'Config file name. (default: .ncurc.{json,yml,js})',
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
      'Check one or more sections of dependencies only: dev, optional, peer, prod, bundle (comma-delimited).',
    default: 'prod,dev,bundle,optional',
    type: 'string',
  },
  {
    long: 'deprecated',
    description: 'Include deprecated packages.',
    type: 'boolean',
  },
  {
    long: 'doctor',
    description:
      'Iteratively installs upgrades and runs tests to identify breaking upgrades. Requires "-u" to execute.',
    type: 'boolean',
    help: extendedHelpDoctor(),
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
    arg: 'matches',
    description:
      'Include only package names matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
  },
  {
    long: 'filterVersion',
    arg: 'matches',
    description: 'Filter on package version using comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
  },
  {
    long: 'format',
    arg: 'value',
    description:
      'Modify the output formatting or show additional information. Specify one or more comma-delimited values: group, ownerChanged, repo.',
    parse: value => (typeof value === 'string' ? value.split(',') : value),
    default: [],
    type: 'string[]',
    choices: ['group', 'ownerChanged', 'repo'],
    help: extendedHelpFormat(),
  },
  {
    long: 'global',
    short: 'g',
    description: 'Check global packages instead of in the current project.',
    type: 'boolean',
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
    arg: 'name',
    // manual default to allow overriding auto yarn detection
    description: 'npm, yarn, staticRegistry (default: npm).',
    help: extendedHelpPackageManager(),
    type: 'string',
  },
  {
    long: 'peer',
    description: 'Check peer dependencies of installed packages and filter updates to compatible versions.',
    type: 'boolean',
    help: `Check peer dependencies of installed packages and filter updates to compatible versions.

${chalk.bold('Example')}

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

${chalk.bold('With --peer')}

ncu upgrades packages to the highest version that still adheres to the peer dependency constraints:


 ncu-test-peer-update     1.0.0  →  1.${chalk.cyan('1.0')}
 ncu-test-return-version  1.0.0  →  1.${chalk.cyan('1.0')}

${chalk.bold('Without --peer')}

As a comparison: without using the --peer option, ncu will suggest the latest versions, ignoring peer dependencies:

 ncu-test-peer-update     1.0.0  →  1.${chalk.cyan('1.0')}
 ncu-test-return-version  1.0.0  →  ${chalk.red('2.0.0')}
  `,
  },
  {
    long: 'pre',
    arg: 'n',
    description: 'Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1)',
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
    arg: 'matches',
    description:
      'Exclude packages matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.',
    parse: (s, p) => p.concat([s]),
    default: [],
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
  },
  {
    long: 'rejectVersion',
    arg: 'matches',
    description: 'Exclude package.json versions using comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | string[] | RegExp | RegExp[] | FilterFunction',
  },
  {
    long: 'removeRange',
    description: 'Remove version ranges from the final package version.',
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
    description: "Don't output anything (--loglevel silent).",
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
      'Determines the version to upgrade to: latest, newest, greatest, minor, patch, @[tag], or [function]. (default: latest).',
    help: extendedHelpTarget(),
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

const cliOptionsSorted = _.sortBy(cliOptions, 'long')

export default cliOptionsSorted
