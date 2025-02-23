import path from 'path'
import { defaultCacheFile } from './lib/cache'
import chalk from './lib/chalk'
import { sortBy } from './lib/sortBy'
import table from './lib/table'
import CLIOption from './types/CLIOption'
import ExtendedHelp from './types/ExtendedHelp'
import { Index } from './types/IndexType'

/** Valid strings for the --target option. Indicates the desired version to upgrade to. */
const supportedVersionTargets = ['latest', 'newest', 'greatest', 'minor', 'patch', 'semver']

/** Pads the left side of each line in a string. */
const padLeft = (s: string, n: number) =>
  s
    .split('\n')
    .map(line => `${''.padStart(n, ' ')}${line}`)
    .join('\n')

/** Formats a code block for CLI or markdown. */
const codeBlock = (code: string, { markdown }: { markdown?: boolean } = {}) =>
  `${markdown ? '```js\n' : ''}${padLeft(code, markdown ? 0 : 4)}${markdown ? '\n```' : ''}`

/** Removes inline code ticks. */
const uncode = (s: string) => s.replace(/`/g, '')

/** Renders the extended help for an option with usage information. */
export const renderExtendedHelp = (option: CLIOption, { markdown }: { markdown?: boolean } = {}) => {
  let output = ''
  if (option.cli !== false) {
    // add -u to doctor option
    output = `Usage:

    ncu --${option.long}${option.arg ? ` [${option.arg}]` : ''}${option.long === 'doctor' ? ' -u' : ''}\n`
  }
  if (option.type === 'boolean') {
    output += `    ncu --no-${option.long}\n`
  }
  if (option.short) {
    // add -u to doctor option
    output += `    ncu -${option.short}${option.arg ? ` [${option.arg}]` : ''}${option.long === 'doctor' ? 'u' : ''}\n`
  }

  if (option.default !== undefined && !(Array.isArray(option.default) && option.default.length === 0)) {
    output += `\nDefault: ${option.default}\n`
  }
  if (option.help) {
    const helpText =
      typeof option.help === 'function'
        ? markdown
          ? option.help({ markdown })
          : uncode(option.help({ markdown }))
        : option.help
    output += `\n${helpText.trim()}\n\n`
  } else if (option.description) {
    const description = markdown ? option.description : uncode(option.description)
    output += `\n${description.replace(/`/g, '')}\n`
  }

  return output.trim()
}

/** Extended help for the --doctor option. */
const extendedHelpDoctor: ExtendedHelp = ({
  markdown,
}) => `Iteratively installs upgrades and runs your project's tests to identify breaking upgrades. Reverts broken upgrades and updates package.json with working upgrades.

${chalk.yellow('Requires `-u` to execute')} (modifies your package file, lock file, and node_modules)

To be more precise:

1. Runs \`npm install\` and \`npm test\` to ensure tests are currently passing.
2. Runs \`ncu -u\` to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. Prints broken upgrades with test error.
7. Saves working upgrades to package.json.

Additional options:

${table({
  markdown,
  rows: [
    [chalk.cyan('--doctorInstall'), 'specify a custom install script (default: `npm install` or `yarn`)'],
    [chalk.cyan('--doctorTest'), 'specify a custom test script (default: `npm test`)'],
  ],
})}

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
const extendedHelpFilterResults: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)

  return `Filters out upgrades based on a user provided function.

${codeInline('filterResults')} runs _after_ new versions are fetched, in contrast to ${codeInline(
    'filter',
  )}, ${codeInline('reject')}, ${codeInline('filterVersion')}, and ${codeInline(
    'rejectVersion',
  )}, which run _before_. This allows you to filter out upgrades with ${codeInline(
    'filterResults',
  )} based on how the version has changed (e.g. a major version change).

> :warning: The predicate function is only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions.

${codeBlock(
  `${chalk.gray(`/** Filter out non-major version updates. Note this could also be achieved with --target semver.
  @param {string} packageName               The name of the dependency.
  @param {string} current                   Current version declaration (may be a range).
  @param {SemVer[]} currentVersionSemver    Current version declaration in semantic versioning format (may be a range).
  @param {string} upgraded                  Upgraded version.
  @param {SemVer} upgradedVersionSemver     Upgraded version in semantic versioning format.
  @returns {boolean}                        Return true if the upgrade should be kept, otherwise it will be ignored.
*/`)}
${chalk.green('filterResults')}: (packageName, { current, currentVersionSemver, upgraded, upgradedVersionSemver }) ${chalk.cyan(
    '=>',
  )} {
  ${chalk.cyan('const')} currentMajor ${chalk.red('=')} parseInt(currentVersionSemver[${chalk.cyan('0')}]?.major, ${chalk.cyan(
    '10',
  )})
  ${chalk.cyan('const')} upgradedMajor ${chalk.red('=')} parseInt(upgradedVersionSemver?.major, ${chalk.cyan('10')})
  ${chalk.red('if')} (currentMajor ${chalk.red('&&')} upgradedMajor) {
    ${chalk.red('return')} currentMajor ${chalk.red('<')} upgradedMajor
  }
  ${chalk.red('return')} ${chalk.cyan('true')}
}`,
  { markdown },
)}

For the SemVer type definition, see: https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring

`
}

/** Extended help for the --format option. */
const extendedHelpFormat: ExtendedHelp = ({ markdown }) => {
  const header =
    'Modify the output formatting or show additional information. Specify one or more comma-delimited values.'
  const tableString = table({
    colAligns: ['right', 'left'],
    markdown,
    rows: [
      ['group', `Groups packages by major, minor, patch, and major version zero updates.`],
      ['ownerChanged', `Shows if the package owner has changed.`],
      ['repo', `Infers and displays links to the package's source code repository. Requires packages to be installed.`],
      ['time', 'Shows the publish time of each upgrade.'],
      ['lines', 'Prints name@version on separate lines. Useful for piping to npm install.'],
      ['installedVersion', 'Prints the exact current version number instead of a range.'],
    ],
  })

  return `${header}\n\n${padLeft(tableString, markdown ? 0 : 4)}
`
}

/** Extended help for the --install option. */
const extendedHelpInstall: ExtendedHelp = ({ markdown }) => {
  const header = 'Control the auto-install behavior.'
  const tableString = table({
    colAligns: ['right', 'left'],
    markdown,
    rows: [
      ['always', `Runs your package manager's install command automatically after upgrading.`],
      ['never', `Does not install and does not prompt.`],
      [
        'prompt',
        `Shows a message after upgrading that recommends an install, but does not install. In interactive mode, prompts for install. (default)`,
      ],
    ],
  })

  return `${header}\n\n${padLeft(tableString, markdown ? 0 : 4)}
`
}

/** Extended help for the --filter option. */
const extendedHelpFilterFunction: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)

  return `Include only package names matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function. Only included packages will be checked with ${codeInline(
    '--peer',
  )}.

${codeInline('--filter')} runs _before_ new versions are fetched, in contrast to ${codeInline(
    '--filterResults',
  )} which runs _after_.

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates as a module.

> :warning: The predicate function is only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions.

${codeBlock(
  `${chalk.gray(`/**
  @param name     The name of the dependency.
  @param semver   A parsed Semver array of the current version.
    (See: https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
  @returns        True if the package should be included, false if it should be excluded.
*/`)}
${chalk.green('filter')}: (name, semver) ${chalk.cyan('=>')} {
  ${chalk.red('if')} (name.startsWith(${chalk.yellow(`'@myorg/'`)})) {
    ${chalk.red('return')} ${chalk.cyan('false')}
  }
  ${chalk.red('return')} ${chalk.cyan('true')}
}`,
  { markdown },
)}

`
}

/** Extended help for the --filterVersion option. */
const extendedHelpFilterVersionFunction: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)

  return `Include only versions matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.

${codeInline('--filterVersion')} runs _before_ new versions are fetched, in contrast to ${codeInline(
    '--filterResults',
  )} which runs _after_.

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates as a module.

> :warning: The predicate function is only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions. This function is an alias for the ${codeInline('filter')} option function.

${codeBlock(
  `${chalk.gray(`/**
  @param name     The name of the dependency.
  @param semver   A parsed Semver array of the current version.
    (See: https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
  @returns        True if the package should be included, false if it should be excluded.
*/`)}
${chalk.green('filterVersion')}: (name, semver) ${chalk.cyan('=>')} {
  ${chalk.red('if')} (name.startsWith(${chalk.yellow(`'@myorg/'`)}) ${chalk.red(
    '&&',
  )} parseInt(semver[0]?.major) ${chalk.cyan('>')} ${chalk.cyan(`5`)}) {
    ${chalk.red('return')} ${chalk.cyan('false')}
  }
  ${chalk.red('return')} ${chalk.cyan('true')}
}`,
  { markdown },
)}

`
}

/** Extended help for the --reject option. */
const extendedHelpRejectFunction: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)

  return `The inverse of ${codeInline(
    '--filter',
  )}. Exclude package names matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function. This will also exclude them from the ${codeInline(
    '--peer',
  )} check.

${codeInline('--reject')} runs _before_ new versions are fetched, in contrast to ${codeInline(
    '--filterResults',
  )} which runs _after_.

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates as a module.

> :warning: The predicate function is only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions.

${codeBlock(
  `${chalk.gray(`/**
  @param name     The name of the dependency.
  @param semver   A parsed Semver array of the current version.
    (See: https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
  @returns        True if the package should be excluded, false if it should be included.
*/`)}
${chalk.green('reject')}: (name, semver) ${chalk.cyan('=>')} {
  ${chalk.red('if')} (name.startsWith(${chalk.yellow(`'@myorg/'`)})) {
    ${chalk.red('return')} ${chalk.cyan('true')}
  }
  ${chalk.red('return')} ${chalk.cyan('false')}
}`,
  { markdown },
)}

`
}

/** Extended help for the --rejectVersion option. */
const extendedHelpRejectVersionFunction: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)

  return `The inverse of ${codeInline(
    '--filterVersion',
  )}. Exclude versions matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.

${codeInline('--rejectVersion')} runs _before_ new versions are fetched, in contrast to ${codeInline(
    '--filterResults',
  )} which runs _after_.

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates as a module.

> :warning: The predicate function is only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions. This function is an alias for the reject option function.

${codeBlock(
  `${chalk.gray(`/**
  @param name     The name of the dependency.
  @param semver   A parsed Semver array of the current version.
    (See: https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
  @returns        True if the package should be excluded, false if it should be included.
*/`)}
${chalk.green('rejectVersion')}: (name, semver) ${chalk.cyan('=>')} {
  ${chalk.red('if')} (name.startsWith(${chalk.yellow(`'@myorg/'`)}) ${chalk.red(
    '&&',
  )} parseInt(semver[0]?.major) ${chalk.cyan('>')} ${chalk.cyan(`5`)}) {
    ${chalk.red('return')} ${chalk.cyan('true')}
  }
  ${chalk.red('return')} ${chalk.cyan('false')}
}`,
  { markdown },
)}

`
}

/** Extended help for the --group option. */
const extendedHelpGroupFunction: ExtendedHelp = ({ markdown }) => {
  return `Customize how packages are divided into groups when using \`--format group\`.

Only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions.

${codeBlock(
  `${chalk.gray(`/**
  @param name             The name of the dependency.
  @param defaultGroup     The predefined group name which will be used by default.
  @param currentSpec      The current version range in your package.json.
  @param upgradedSpec     The upgraded version range that will be written to your package.json.
  @param upgradedVersion  The upgraded version number returned by the registry.
  @returns                A predefined group name ('major' | 'minor' | 'patch' | 'majorVersionZero' | 'none') or a custom string to create your own group.
*/`)}
${chalk.green('groupFunction')}: (name, defaultGroup, currentSpec, upgradedSpec, upgradedVersion) ${chalk.cyan('=>')} {
  ${chalk.red('if')} (name ${chalk.red('===')} ${chalk.yellow(`'typescript'`)} ${chalk.red(
    '&&',
  )} defaultGroup ${chalk.red('===')} ${chalk.yellow(`'minor'`)}) {
    ${chalk.red('return')} ${chalk.yellow(`'major'`)}
  }
  ${chalk.red('if')} (name.startsWith(${chalk.yellow(`'@myorg/'`)})) {
    ${chalk.red('return')} ${chalk.yellow(`'My Org'`)}
  }
  ${chalk.red('return')} defaultGroup
}`,
  { markdown },
)}

`
}

/** Extended help for the --target option. */
const extendedHelpTarget: ExtendedHelp = ({ markdown }) => {
  const header = 'Determines the version to upgrade to. (default: "latest")'
  const tableString = table({
    colAligns: ['right', 'left'],
    markdown,
    rows: [
      [
        'greatest',
        `Upgrade to the highest version number published, regardless of release date or tag. Includes prereleases.`,
      ],
      [
        'latest',
        `Upgrade to whatever the package's "latest" git tag points to. Excludes prereleases unless --pre is specified.`,
      ],
      ['minor', 'Upgrade to the highest minor version without bumping the major version.'],
      [
        'newest',
        `Upgrade to the version with the most recent publish date, even if there are other version numbers that are higher. Includes prereleases.`,
      ],
      ['patch', `Upgrade to the highest patch version without bumping the minor or major versions.`],
      ['semver', `Upgrade to the highest version within the semver range specified in your package.json.`],
      ['@[tag]', `Upgrade to the version published to a specific tag, e.g. 'next' or 'beta'.`],
    ],
  })

  return `${header}

${padLeft(tableString, markdown ? 0 : 4)}

e.g.

${codeBlock(`ncu --target semver`)}

You can also specify a custom function in your .ncurc.js file, or when importing npm-check-updates as a module.

> :warning: The predicate function is only available in .ncurc.js or when importing npm-check-updates as a module, not on the command line. To convert a JSON config to a JS config, follow the instructions at https://github.com/raineorshine/npm-check-updates#config-functions.

${codeBlock(
  `${chalk.gray(`/** Upgrade major version zero to the next minor version, and everything else to latest.
  @param name     The name of the dependency.
  @param semver   A parsed Semver object of the upgraded version.
    (See: https://git.coolaj86.com/coolaj86/semver-utils.js#semverutils-parse-semverstring)
  @returns        One of the valid target values (specified in the table above).
*/`)}
${chalk.green('target')}: (name, semver) ${chalk.cyan('=>')} {
  ${chalk.red('if')} (parseInt(semver[0]?.major) ${chalk.red('===')} ${chalk.yellow("'0'")}) ${chalk.red(
    'return',
  )} ${chalk.yellow("'minor'")}
  ${chalk.red('return')} ${chalk.yellow("'latest'")}
}`,
  { markdown },
)}
`
}

/** Extended help for the --packageManager option. */
const extendedHelpPackageManager: ExtendedHelp = ({ markdown }) => {
  const header = 'Specifies the package manager to use when looking up versions.'
  const tableString = table({
    colAligns: ['right', 'left'],
    markdown,
    rows: [
      ['npm', `System-installed npm. Default.`],
      ['yarn', `System-installed yarn. Automatically used if yarn.lock is present.`],
      ['pnpm', `System-installed pnpm. Automatically used if pnpm-lock.yaml is present.`],
      ['bun', `System-installed bun. Automatically used if bun.lock or bun.lockb is present.`],
    ],
  })

  return `${header}\n\n${padLeft(tableString, markdown ? 0 : 4)}
`
}

/** Extended help for the --registryType option. */
const extendedHelpRegistryType: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)

  const header = `Specify whether ${codeInline('--registry')} refers to a full npm registry or a simple JSON file.`
  const tableString = table({
    colAligns: ['right', 'left'],
    markdown,
    rows: [
      ['npm', `Default npm registry`],
      [
        'json',
        `Checks versions from a file or url to a simple JSON registry. Must include the ${chalk.cyan(
          '`--registry`',
        )} option.

Example:

    ${chalk.gray('// local file')}
    ${chalk.cyan('$')} ncu --registryType json --registry ./registry.json

    ${chalk.gray('// url')}
    ${chalk.cyan('$')} ncu --registryType json --registry https://api.mydomain/registry.json

    ${chalk.gray('// you can omit --registryType when the registry ends in .json')}
    ${chalk.cyan('$')} ncu --registry ./registry.json
    ${chalk.cyan('$')} ncu --registry https://api.mydomain/registry.json

registry.json:

    {
      "prettier": "2.7.1",
      "typescript": "4.7.4"
    }

`,
      ],
    ],
  })

  return `${header}\n\n${padLeft(tableString, markdown ? 0 : 4)}
`
}

/** Extended help for the --peer option. */
const extendedHelpPeer: ExtendedHelp = ({ markdown }) => {
  /** If markdown, surround inline code with backticks. */
  const codeInline = (code: string) => (markdown ? `\`${code}\`` : code)
  return `Check peer dependencies of installed packages and filter updates to compatible versions.

${chalk.bold('Example')}:

The following example demonstrates how \`--peer\` works, and how it uses peer dependencies from upgraded modules.

The package ${chalk.bold('ncu-test-peer-update')} has two versions published:

- 1.0.0 has peer dependency ${codeInline('"ncu-test-return-version": "1.0.x"')}
- 1.1.0 has peer dependency ${codeInline('"ncu-test-return-version": "1.1.x"')}

Our test app has the following dependencies:

    "ncu-test-peer-update": "1.0.0",
    "ncu-test-return-version": "1.0.0"

The latest versions of these packages are:

    "ncu-test-peer-update": "1.1.0",
    "ncu-test-return-version": "2.0.0"

${chalk.bold('With `--peer`')}:

ncu upgrades packages to the highest version that still adheres to the peer dependency constraints:

    ncu-test-peer-update     1.0.0  →  1.${chalk.cyan('1.0')}
    ncu-test-return-version  1.0.0  →  1.${chalk.cyan('1.0')}

${chalk.bold('Without `--peer`')}:

As a comparison: without using the \`--peer\` option, ncu will suggest the latest versions, ignoring peer dependencies:

    ncu-test-peer-update     1.0.0  →  1.${chalk.cyan('1.0')}
    ncu-test-return-version  1.0.0  →  ${chalk.red('2.0.0')}
`
}

// store CLI options separately from bin file so that they can be used to build type definitions
const cliOptions: CLIOption[] = [
  {
    long: 'cache',
    description: `Cache versions to a local cache file. Default \`--cacheFile\` is ${defaultCacheFile} and default \`--cacheExpiration\` is 10 minutes.`,
    type: 'boolean',
  },
  {
    long: 'cacheClear',
    description: 'Clear the default cache, or the cache file specified by `--cacheFile`.',
    type: 'boolean',
  },
  {
    long: 'cacheExpiration',
    arg: 'min',
    description: 'Cache expiration in minutes. Only works with `--cache`.',
    parse: s => parseInt(s, 10),
    default: 10,
    type: 'number',
  },
  {
    long: 'cacheFile',
    arg: 'path',
    description: 'Filepath for the cache file. Only works with `--cache`.',
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
    description: `Run recursively in current working directory. Alias of (\`--packageFile '**/package.json'\`).`,
    type: 'boolean',
  },
  {
    long: 'dep',
    arg: 'value',
    description:
      'Check one or more sections of dependencies only: dev, optional, peer, prod, or packageManager (comma-delimited).',
    default: ['prod', 'dev', 'optional', 'packageManager'],
    parse: value => (value && typeof value === 'string' ? value.split(',') : value),
    type: 'string | readonly string[]',
  },
  {
    long: 'deprecated',
    default: true,
    description:
      'Include deprecated packages. Use `--no-deprecated` to exclude deprecated packages (uses more bandwidth).',
    type: 'boolean',
  },
  {
    long: 'doctor',
    short: 'd',
    description:
      'Iteratively installs upgrades and runs tests to identify breaking upgrades. Requires `-u` to execute.',
    type: 'boolean',
    help: extendedHelpDoctor,
  },
  {
    long: 'doctorInstall',
    arg: 'command',
    description:
      'Specifies the install script to use in doctor mode. (default: `npm install` or the equivalent for your package manager)',
    type: 'string',
  },
  {
    long: 'doctorTest',
    arg: 'command',
    description: 'Specifies the test script to use in doctor mode. (default: `npm test`)',
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
    type: 'string | RegExp | readonly (string | RegExp)[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
    help: extendedHelpFilterFunction,
  },
  {
    long: 'filterResults',
    arg: 'fn',
    cli: false,
    description: `Filters out upgrades based on a user provided function.`,
    type: 'FilterResultsFunction',
    help: extendedHelpFilterResults,
  },
  {
    long: 'filterVersion',
    arg: 'p',
    description: 'Filter on package version using comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | RegExp | readonly (string | RegExp)[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
    help: extendedHelpFilterVersionFunction,
  },
  {
    long: 'format',
    arg: 'value',
    description:
      'Modify the output formatting or show additional information. Specify one or more comma-delimited values: group, ownerChanged, repo, time, lines, installedVersion.',
    parse: value => (typeof value === 'string' ? value.split(',') : value),
    default: [],
    type: 'readonly string[]',
    choices: ['group', 'ownerChanged', 'repo', 'time', 'lines', 'installedVersion'],
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
    cli: false,
    description: `Customize how packages are divided into groups when using \`--format group\`.`,
    type: 'GroupFunction',
    help: extendedHelpGroupFunction,
  },
  {
    long: 'install',
    arg: 'value',
    description: 'Control the auto-install behavior: always, never, prompt.',
    help: extendedHelpInstall,
    default: 'prompt',
    choices: ['always', 'never', 'prompt'],
    type: `'always' | 'never' | 'prompt'`,
  },
  {
    long: 'interactive',
    short: 'i',
    description: 'Enable interactive prompts for each dependency; implies `-u` unless one of the json options are set.',
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
    description: `Merges nested configs with the root config file for \`--deep\` or \`--packageFile\` options. (default: false)`,
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
    description: 'npm, yarn, pnpm, deno, bun, staticRegistry (default: npm).',
    help: extendedHelpPackageManager,
    type: `'npm' | 'yarn' | 'pnpm' | 'deno' | 'bun' | 'staticRegistry'`,
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
      'Include prerelease versions, e.g. -alpha.0, -beta.5, -rc.2. Automatically set to 1 when `--target` is newest or greatest, or when the current version is a prerelease. (default: 0)',
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
    description: 'Specify the registry to use when looking up package versions.',
    type: 'string',
  },
  {
    long: 'registryType',
    arg: 'type',
    description:
      'Specify whether --registry refers to a full npm registry or a simple JSON file or url: npm, json. (default: npm)',
    help: extendedHelpRegistryType,
    type: `'npm' | 'json'`,
  },
  {
    long: 'reject',
    short: 'x',
    arg: 'p',
    description:
      'Exclude packages matching the given string, wildcard, glob, comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | RegExp | readonly (string | RegExp)[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
    help: extendedHelpRejectFunction,
  },
  {
    long: 'rejectVersion',
    arg: 'p',
    description: 'Exclude package.json versions using comma-or-space-delimited list, /regex/, or predicate function.',
    type: 'string | RegExp | (string | RegExp)[] | FilterFunction',
    parse: (value, accum) => [...(accum || []), value],
    help: extendedHelpRejectVersionFunction,
  },
  {
    long: 'removeRange',
    description: 'Remove version ranges from the final package version.',
    type: 'boolean',
  },
  {
    long: 'root',
    default: true,
    description:
      'Runs updates on the root project in addition to specified workspaces. Only allowed with `--workspace` or `--workspaces`.',
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
    description: "Don't output anything. Alias for `--loglevel` silent.",
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
    description: `Determines the version to upgrade to: latest, newest, greatest, minor, patch, semver, \`@[tag]\`, or [function]. (default: latest)`,
    help: extendedHelpTarget,
    // eslint-disable-next-line no-template-curly-in-string
    type: `${supportedVersionTargets.map(s => `'${s}'`).join(' | ')} | ${'`@${string}`'} | TargetFunction`,
  },
  {
    long: 'timeout',
    arg: 'ms',
    description: 'Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registry-fetch)',
    parse: s => parseInt(s, 10),
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
    description: 'Log additional information for debugging. Alias for `--loglevel` verbose.',
    type: 'boolean',
  },
  {
    long: 'workspace',
    short: 'w',
    arg: 's',
    parse: (value, accum) => [...accum, value],
    default: [],
    description: 'Run on one or more specified workspaces. Add `--root` to also upgrade the root project.',
    type: 'readonly string[]',
  },
  {
    long: 'workspaces',
    short: 'ws',
    description: 'Run on all workspaces. Add `--root` to also upgrade the root project.',
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

const cliOptionsSorted = sortBy(cliOptions, v => v.long)

export default cliOptionsSorted
