const _ = require('lodash')

// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions = [
  {
    long: 'concurrency',
    arg: 'n',
    description: 'Max number of concurrent HTTP requests to registry.',
    parse: s => parseInt(s, 10),
    default: 8
  },
  {
    long: 'configFileName',
    arg: 'filename',
    description: 'Config file name (default: .ncurc.{json,yml,js})'
  },
  {
    long: 'configFilePath',
    arg: 'path',
    description: 'Directory of .ncurc config file (default: directory of `packageFile`).'
  },
  {
    long: 'cwd',
    arg: 'path',
    description: 'Working directory in which npm will be executed.'
  },
  {
    long: 'dep',
    arg: 'value',
    description: 'Check one or more sections of dependencies only: prod, dev, peer, optional, bundle (comma-delimited).'
  },
  {
    long: 'deprecated',
    description: 'Include deprecated packages.'
  },
  {
    long: 'doctor',
    description: 'Iteratively installs upgrades and runs tests to identify breaking upgrades. Run "ncu --doctor" for detailed help. Add "-u" to execute.',
  },
  {
    long: 'enginesNode',
    description: 'Include only packages that satisfy engines.node as specified in the package file.'
  },
  {
    long: 'errorLevel',
    short: 'e',
    arg: 'n',
    description: 'Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration).',
    parse: s => parseInt(s, 10),
    default: 1
  },
  {
    long: 'filter',
    short: 'f',
    arg: 'matches',
    description: 'Include only package names matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    long: 'filterVersion',
    arg: 'matches',
    description: 'Filter on package version using comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    long: 'format',
    arg: 'value',
    description: 'Enable additional output data, string or comma-delimited list: ownerChanged, repo. ownerChanged: shows if the package owner changed between versions. repo: infers and displays links to source code repository.',
    parse: value => typeof value === 'string' ? value.split(',') : value,
    default: [],
    type: 'string[]'
  },
  {
    long: 'global',
    short: 'g',
    description: 'Check global packages instead of in the current project.'
  },
  {
    long: 'greatest',
    description: 'DEPRECATED. Renamed to "--target greatest".',
    deprecated: true
  },
  {
    long: 'interactive',
    short: 'i',
    description: 'Enable interactive prompts for each dependency; implies -u unless one of the json options are set,'
  },
  {
    // program.json is set to true in programInit if any options that begin with 'json' are true
    long: 'jsonAll',
    short: 'j',
    description: 'Output new package file instead of human-readable message.'
  },
  {
    long: 'jsonDeps',
    description: 'Like `jsonAll` but only lists `dependencies`, `devDependencies`, `optionalDependencies`, etc of the new package data.'
  },
  {
    long: 'jsonUpgraded',
    description: 'Output upgraded dependencies in json.'
  },
  {
    long: 'loglevel',
    short: 'l',
    arg: 'n',
    description: 'Amount to log: silent, error, minimal, warn, info, verbose, silly.',
    default: 'warn'
  },
  {
    short: 'm',
    long: 'minimal',
    description: 'Do not upgrade newer versions that are already satisfied by the version range according to semver.'
  },
  {
    short: 'n',
    long: 'newest',
    description: 'DEPRECATED. Renamed to "--target newest".',
    deprecated: true
  },
  {
    long: 'ownerChanged',
    short: 'o',
    description: 'DEPRECATED. Renamed to "--format ownerChanged".',
    deprecated: true
  },
  {
    long: 'packageData',
    arg: 'value',
    description: 'Package file data (you can also use stdin).'
  },
  {
    long: 'packageFile',
    arg: 'path',
    description: 'Package file location (default: ./package.json).'
  },
  {
    long: 'packageManager',
    short: 'p',
    arg: 'name',
    description: 'npm, yarn',
    default: 'npm'
  },
  {
    long: 'pre',
    arg: 'n',
    description: 'Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1).',
    type: 'boolean'
  },
  {
    long: 'prefix',
    arg: 'path',
    description: 'Current working directory of npm.'
  },
  {
    long: 'registry',
    short: 'r',
    arg: 'url',
    description: 'Third-party npm registry.'
  },
  {
    long: 'reject',
    short: 'x',
    arg: 'matches',
    description: 'Exclude packages matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    long: 'rejectVersion',
    arg: 'matches',
    description: 'Exclude package.json versions using comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    long: 'removeRange',
    description: 'Remove version ranges from the final package version.'
  },
  {
    long: 'semverLevel',
    arg: 'value',
    description: 'DEPRECATED. Renamed to --target.',
    deprecated: true
  },
  {
    long: 'silent',
    short: 's',
    description: 'Don\'t output anything (--loglevel silent).'
  },
  {
    long: 'target',
    short: 't',
    arg: 'value',
    description: 'Target version to upgrade to: latest, newest, greatest, minor, patch. (default: "latest")'
  },
  {
    long: 'timeout',
    arg: 'ms',
    description: 'Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch).'
  },
  {
    long: 'upgrade',
    short: 'u',
    description: 'Overwrite package file with upgraded versions instead of just outputting to console.'
  },
]

module.exports = _.sortBy(cliOptions, 'long')
