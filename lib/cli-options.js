// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions = [
  {
    optionName: 'concurrency',
    name: '--concurrency <n>',
    description: 'Max number of concurrent HTTP requests to registry.',
    parse: s => parseInt(s, 10),
    default: 8
  },
  {
    optionName: 'configFilePath',
    name: '--configFilePath <path>',
    description: 'Directory of .ncurc config file (default: directory of `packageFile`).'
  },
  {
    optionName: 'configFileName',
    name: '--configFileName <filename>',
    description: 'Config file name (default: .ncurc.{json,yml,js})'
  },
  {
    optionName: 'cwd',
    name: '--cwd <path>',
    description: 'Working directory in which npm will be executed.'
  },
  {
    optionName: 'dep',
    name: '--dep <dep>',
    description: 'Check one or more sections of dependencies only: prod, dev, peer, optional, bundle (comma-delimited).'
  },
  {
    optionName: 'deprecated',
    name: '--deprecated',
    description: 'Include deprecated packages.'
  },
  {
    optionName: 'doctor',
    name: '--doctor',
    description: 'Iteratively installs upgrades and runs tests to identify breaking upgrades. Run "ncu --doctor" for detailed help. Add "-u" to execute.',
  },
  {
    optionName: 'enginesNode',
    name: '--enginesNode',
    description: 'Include only packages that satisfy engines.node as specified in the package file.'
  },
  {
    optionName: 'errorLevel',
    name: '-e, --errorLevel <n>',
    description: 'Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration).',
    parse: s => parseInt(s, 10),
    default: 1
  },
  {
    optionName: 'filter',
    name: '-f, --filter <matches>',
    description: 'Include only package names matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    optionName: 'global',
    name: '-g, --global',
    description: 'Check global packages instead of in the current project.'
  },
  {
    optionName: 'greatest',
    name: '--greatest',
    description: 'DEPRECATED. Renamed to "--target greatest".'
  },
  {
    optionName: 'interactive',
    name: '-i, --interactive',
    description: 'Enable interactive prompts for each dependency; implies -u unless one of the json options are set,'
  },
  {
    // program.json is set to true in programInit if any options that begin with 'json' are true
    optionName: 'jsonAll',
    name: '-j, --jsonAll',
    description: 'Output new package file instead of human-readable message.'
  },
  {
    optionName: 'jsonDeps',
    name: '--jsonDeps',
    description: 'Like `jsonAll` but only lists `dependencies`, `devDependencies`, `optionalDependencies`, etc of the new package data.'
  },
  {
    optionName: 'jsonUpgraded',
    name: '--jsonUpgraded',
    description: 'Output upgraded dependencies in json.'
  },
  {
    optionName: 'loglevel',
    name: '-l, --loglevel <n>',
    description: 'Amount to log: silent, error, minimal, warn, info, verbose, silly.',
    default: 'warn'
  },
  {
    optionName: 'minimal',
    name: '-m, --minimal',
    description: 'Do not upgrade newer versions that are already satisfied by the version range according to semver.'
  },
  {
    optionName: 'newest',
    name: '-n, --newest',
    description: 'DEPRECATED. Renamed to "--target newest".'
  },
  {
    optionName: 'packageManager',
    name: '-p, --packageManager <name>',
    description: 'npm, yarn',
    default: 'npm'
  },
  {
    optionName: 'ownerChanged',
    name: '-o, --ownerChanged',
    description: 'DEPRECATED. Renamed to "--output ownerChanged".',
  },
  {
    optionName: 'output',
    name: '--output <value>',
    description: 'Enable additional output data, string or comma-delimited list: ownerChanged, repositoryLink. ownerChanged: shows if the package owner changed between versions. repositoryLink: infers and displays links to source code repository.',
    parse: value => typeof value === 'string' ? value.split(',') : value,
    default: [],
    type: 'string[]'
  },
  {
    optionName: 'packageData',
    name: '--packageData <string>',
    description: 'Package file data (you can also use stdin).'
  },
  {
    optionName: 'packageFile',
    name: '--packageFile <path>',
    description: 'Package file location (default: ./package.json).'
  },
  {
    optionName: 'pre',
    name: '--pre <n>',
    description: 'Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1).',
    type: 'boolean'
  },
  {
    optionName: 'prefix',
    name: '--prefix <path>',
    description: 'Current working directory of npm.'
  },
  {
    optionName: 'registry',
    name: '-r, --registry <url>',
    description: 'Third-party npm registry.'
  },
  {
    optionName: 'removeRange',
    name: '--removeRange',
    description: 'Remove version ranges from the final package version.'
  },
  {
    optionName: 'semverLevel',
    name: '--semverLevel <value>',
    description: 'DEPRECATED. Renamed to --target.'
  },
  {
    optionName: 'silent',
    name: '-s, --silent',
    description: 'Don\'t output anything (--loglevel silent).'
  },
  {
    optionName: 'target',
    name: '-t, --target <value>',
    description: 'Target version to upgrade to: latest, newest, greatest, minor, patch. (default: "latest")'
  },
  {
    optionName: 'timeout',
    name: '--timeout <ms>',
    description: 'Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch).'
  },
  {
    optionName: 'upgrade',
    name: '-u, --upgrade',
    description: 'Overwrite package file with upgraded versions instead of just outputting to console.'
  },
  {
    optionName: 'reject',
    name: '-x, --reject <matches>',
    description: 'Exclude packages matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
]

module.exports = cliOptions
