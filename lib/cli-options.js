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
    long: 'configFilePath',
    arg: 'path',
    description: 'Directory of .ncurc config file (default: directory of `packageFile`).'
  },
  {
    long: 'configFileName',
    arg: 'filename',
    description: 'Config file name (default: .ncurc.{json,yml,js})'
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
    short: 'e',
    long: 'errorLevel',
    arg: 'n',
    description: 'Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration).',
    parse: s => parseInt(s, 10),
    default: 1
  },
  {
    short: 'f',
    long: 'filter',
    arg: 'matches',
    description: 'Include only package names matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    short: 'g',
    long: 'global',
    description: 'Check global packages instead of in the current project.'
  },
  {
    long: 'greatest',
    description: 'DEPRECATED. Renamed to "--target greatest".',
    deprecated: true
  },
  {
    short: 'i',
    long: 'interactive',
    description: 'Enable interactive prompts for each dependency; implies -u unless one of the json options are set,'
  },
  {
    // program.json is set to true in programInit if any options that begin with 'json' are true
    short: 'j',
    long: 'jsonAll',
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
    short: 'l',
    long: 'loglevel',
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
    short: 'p',
    long: 'packageManager',
    arg: 'name',
    description: 'npm, yarn',
    default: 'npm'
  },
  {
    short: 'o',
    long: 'ownerChanged',
    description: 'DEPRECATED. Renamed to "--format ownerChanged".',
    deprecated: true
  },
  {
    long: 'format',
    arg: 'value',
    description: 'Enable additional output data, string or comma-delimited list: ownerChanged, repositoryLink. ownerChanged: shows if the package owner changed between versions. repositoryLink: infers and displays links to source code repository.',
    parse: value => typeof value === 'string' ? value.split(',') : value,
    default: [],
    type: 'string[]'
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
    short: 'r',
    long: 'registry',
    arg: 'url',
    description: 'Third-party npm registry.'
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
    short: 's',
    long: 'silent',
    description: 'Don\'t output anything (--loglevel silent).'
  },
  {
    short: 't',
    long: 'target',
    arg: 'value',
    description: 'Target version to upgrade to: latest, newest, greatest, minor, patch. (default: "latest")'
  },
  {
    long: 'timeout',
    arg: 'ms',
    description: 'Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch).'
  },
  {
    short: 'u',
    long: 'upgrade',
    description: 'Overwrite package file with upgraded versions instead of just outputting to console.'
  },
  {
    short: 'x',
    long: 'reject',
    arg: 'matches',
    description: 'Exclude packages matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
]

module.exports = cliOptions
