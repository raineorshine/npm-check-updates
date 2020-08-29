// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions = [
  {
    name: '--concurrency <n>',
    description: 'Max number of concurrent HTTP requests to registry.',
    parse: s => parseInt(s, 10),
    default: 8
  },
  {
    name: '--configFilePath <path>',
    description: 'Directory of .ncurc config file (default: directory of `packageFile`).'
  },
  {
    name: '--configFileName <filename>',
    description: 'Config file name (default: .ncurc.{json,yml,js})'
  },
  {
    name: '--cwd <path>',
    description: 'Working directory in which npm will be executed.'
  },
  {
    name: '--dep <dep>',
    description: 'Check one or more sections of dependencies only: prod, dev, peer, optional, bundle (comma-delimited).'
  },
  {
    name: '--doctor',
    description: 'Iteratively installs upgrades and runs tests to identify breaking upgrades. Run "ncu --doctor" for detailed help. Add "-u" to execute.',
  },
  {
    name: '--enginesNode',
    description: 'Include only packages that satisfy engines.node as specified in the package file.'
  },
  {
    name: '-e, --errorLevel <n>',
    description: 'Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration).',
    parse: s => parseInt(s, 10),
    default: 1
  },
  {
    name: '-f, --filter <matches>',
    description: 'Include only package names matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
  {
    name: '-g, --global',
    description: 'Check global packages instead of in the current project.'
  },
  {
    name: '--greatest',
    description: 'DEPRECATED. Renamed to "--target greatest".'
  },
  {
    name: '-i, --interactive',
    description: 'Enable interactive prompts for each dependency; implies -u unless one of the json options are set,'
  },
  {
    // program.json is set to true in programInit if any options that begin with 'json' are true
    name: '-j, --jsonAll',
    description: 'Output new package file instead of human-readable message.'
  },
  {
    name: '--jsonDeps',
    description: 'Like `jsonAll` but only lists `dependencies`, `devDependencies`, `optionalDependencies`, etc of the new package data.'
  },
  {
    name: '--jsonUpgraded',
    description: 'Output upgraded dependencies in json.'
  },
  {
    name: '-l, --loglevel <n>',
    description: 'Amount to log: silent, error, minimal, warn, info, verbose, silly.',
    default: 'warn'
  },
  {
    name: '-m, --minimal',
    description: 'Do not upgrade newer versions that are already satisfied by the version range according to semver.'
  },
  {
    name: '-n, --newest',
    description: 'DEPRECATED. Renamed to "--target newest".'
  },
  {
    name: '-p, --packageManager <name>',
    description: 'npm, yarn',
    default: 'npm'
  },
  {
    name: '-o, --ownerChanged',
    description: 'Check if the package owner changed between current and upgraded version.',
  },
  {
    name: '--packageData <string>',
    description: 'Package file data (you can also use stdin).'
  },
  {
    name: '--packageFile <path>',
    description: 'Package file location (default: ./package.json).'
  },
  {
    name: '--pre <n>',
    description: 'Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1).',
    type: 'boolean'
  },
  {
    name: '--prefix <path>',
    description: 'Current working directory of npm.'
  },
  {
    name: '-r, --registry <url>',
    description: 'Third-party npm registry.'
  },
  {
    name: '--removeRange',
    description: 'Remove version ranges from the final package version.'
  },
  {
    name: '--semverLevel <value>',
    description: 'DEPRECATED. Renamed to --target.'
  },
  {
    name: '-s, --silent',
    description: 'Don\'t output anything (--loglevel silent).'
  },
  {
    name: '-t, --target <value>',
    description: 'Target version to upgrade to: latest, newest, greatest, minor, patch.',
    default: 'latest'
  },
  {
    name: '--timeout <ms>',
    description: 'Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch).'
  },
  {
    name: '-u, --upgrade',
    description: 'Overwrite package file with upgraded versions instead of just outputting to console.'
  },
  {
    name: '-x, --reject <matches>',
    description: 'Exclude packages matching the given string, comma-or-space-delimited list, or /regex/.',
    type: 'string | string[] | RegExp'
  },
]

const supportedVersionTargets = ['latest', 'newest', 'greatest', 'minor', 'patch']

const doctorHelpText = `Usage: ncu --doctor [-u] [options]

Iteratively installs upgrades and runs tests to identify breaking upgrades. Add "-u" to execute (modifies your package file, lock file, and node_modules).

To be more precise:
1. Runs "npm install" and "npm test" to ensure tests are currently passing.
2. Runs "ncu -u" to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. When the breaking upgrade is found, saves partially upgraded package.json (not including the breaking upgrade) and exits.

Example:

$ ncu --doctor -u
npm install
npm run test
ncu -u
npm install
npm run test
Failing tests found:
/projects/myproject/test.js:13
  throw new Error('Test failed!')
  ^
Now let's identify the culprit, shall we?
Restoring package.json
Restoring package-lock.json
npm install
npm install --no-save react@16.0.0
npm run test
  ✓ react 15.0.0 → 16.0.0
npm install --no-save react-redux@7.0.0
npm run test
  ✗ react-redux 6.0.0 → 7.0.0
Saving partially upgraded package.json
`

module.exports = { cliOptions, doctorHelpText, supportedVersionTargets }
