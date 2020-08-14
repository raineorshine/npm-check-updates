// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions = [
  {
    name: '--concurrency <n>',
    description: 'max number of concurrent HTTP requests to registry.',
    parse: s => parseInt(s, 10),
    default: 8
  },
  {
    name: '--configFilePath <path>',
    description: 'rc config file path (default: directory of `packageFile` or ./ otherwise)'
  },
  {
    name: '--configFileName <path>',
    description: 'rc config file name (default: .ncurc.{json,yml,js})'
  },
  {
    name: '--cwd <path>',
    description: 'working directory in which npm will be executed'
  },
  {
    name: '--dep <dep>',
    description: 'check only a specific section(s) of dependencies: prod, dev, peer, optional, bundle (comma-delimited)'
  },
  {
    name: '-e, --error-level <n>',
    description: 'set the error-level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration).',
    parse: s => parseInt(s, 10),
    default: 1
  },
  {
    name: '--engines-node',
    description: 'include only packages that satisfy engines.node as specified in the package file'
  },
  {
    name: '-f, --filter <matches>',
    description: 'include only package names matching the given string, comma-or-space-delimited list, or /regex/'
  },
  {
    name: '-g, --global',
    description: 'check global packages instead of in the current project'
  },
  {
    name: '-i, --interactive',
    description: 'Enable interactive prompts for each dependency; implies -u unless one of the json options are set'
  },
  {
    // program.json is set to true in programInit if any options that begin with 'json' are true
    name: '-j, --jsonAll',
    description: 'output new package file instead of human-readable message'
  },
  {
    name: '--jsonDeps',
    description: 'Will return output like `jsonAll` but only lists `dependencies`, `devDependencies`, and `optionalDependencies` of the new package data.'
  },
  {
    name: '--jsonUpgraded',
    description: 'output upgraded dependencies in json'
  },
  {
    name: '-l, --loglevel <n>',
    description: 'what level of logs to report: silent, error, minimal, warn, info, verbose, silly',
    default: 'warn'
  },
  {
    name: '-m, --minimal',
    description: 'do not upgrade newer versions that are already satisfied by the version range according to semver'
  },
  {
    name: '-n, --newest',
    description: 'find the newest versions available instead of the latest stable versions'
  },
  {
    name: '-p, --packageManager <name>',
    description: 'npm, yarn',
    default: 'npm'
  },
  {
    name: '--packageData',
    description: 'include stringified package file (use stdin instead)'
  },
  {
    name: '--packageFile <filename>',
    description: 'package file location (default: ./package.json)'
  },
  {
    name: '--pre <n>',
    description: 'Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1)'
  },
  {
    name: '--prefix <path>',
    description: 'Used as current working directory in npm'
  },
  {
    name: '-r, --registry <url>',
    description: 'specify third-party npm registry'
  },
  {
    name: '--removeRange',
    description: 'remove version ranges from the final package version'
  },
  {
    name: '-s, --silent',
    description: 'don\'t output anything (--loglevel silent)'
  },
  {
    name: '--semverLevel <level>',
    description: 'find the highest version within "major" or "minor"'
  },
  {
    name: '-t, --greatest',
    description: 'find the highest versions available instead of the latest stable versions'
  },
  {
    name: '--timeout <ms>',
    description: 'global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch)'
  },
  {
    name: '-u, --upgrade',
    description: 'overwrite package file'
  },
  {
    name: '-x, --reject <matches>',
    description: 'exclude packages matching the given string, comma-or-space-delimited list, or /regex/'
  },
]

module.exports = { cliOptions }
