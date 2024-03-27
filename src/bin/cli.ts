#!/usr/bin/env node
import { Help, Option, program } from 'commander'
import cloneDeep from 'lodash/cloneDeep'
import pickBy from 'lodash/pickBy'
import semver from 'semver'
import pkg from '../../package.json'
import cliOptions, { renderExtendedHelp } from '../cli-options'
import ncu from '../index'
import { chalkInit } from '../lib/chalk'
// async global contexts are only available in esm modules -> function
import getNcuRc from '../lib/getNcuRc'

/** Removes inline code ticks. */
const uncode = (s: string) => s.replace(/`/g, '')

;(async () => {
  // importing update-notifier dynamically as esm modules are only allowed to be dynamically imported inside of cjs modules
  const { default: updateNotifier } = await import('update-notifier')

  // check if a new version of ncu is available and print an update notification
  //
  // For testing from specific versions, use:
  //
  // updateNotifier({
  //   pkg: {
  //     name: 'npm-check-updates',
  //     version: x.y.z
  //   },
  //   updateCheckInterval: 0
  // })

  const notifier = updateNotifier({ pkg })
  if (notifier.update && notifier.update.latest !== pkg.version) {
    const { default: chalk } = await import('chalk')

    // generate release urls for all the major versions from the current version up to the latest
    const currentMajor = semver.parse(notifier.update.current)?.major
    const latestMajor = semver.parse(notifier.update.latest)?.major
    const majorVersions =
      // Greater than or equal to (>=) will always return false if either operant is NaN or undefined.
      // Without this condition, it can result in a RangeError: Invalid array length.
      // See: https://github.com/raineorshine/npm-check-updates/issues/1200
      currentMajor && latestMajor && latestMajor >= currentMajor
        ? new Array(latestMajor - currentMajor).fill(0).map((x, i) => currentMajor + i + 1)
        : []
    const releaseUrls = majorVersions.map(majorVersion => `${pkg.homepage ?? ''}/releases/tag/v${majorVersion}.0.0`)

    // for non-major updates, generate a URL to view all commits since the current version
    const compareUrl = `${pkg.homepage ?? ''}/compare/v${notifier.update.current}...v${notifier.update.latest}`

    notifier.notify({
      defer: false,
      isGlobal: true,
      message: `Update available ${chalk.dim('{currentVersion}')}${chalk.reset(' → ')}${
        notifier.update.type === 'major'
          ? chalk.red('{latestVersion}')
          : notifier.update.type === 'minor'
            ? chalk.yellow('{latestVersion}')
            : chalk.green('{latestVersion}')
      }
Run ${chalk.cyan('{updateCommand}')} to update
${chalk.dim.underline(
  notifier.update.type === 'major' ? releaseUrls.map(url => chalk.dim.underline(url)).join('\n') : compareUrl,
)}`,
    })
  }

  // manually detect option-specific help
  // https://github.com/raineorshine/npm-check-updates/issues/787
  const rawArgs = process.argv.slice(2)
  if ((rawArgs[0] === '--help' || rawArgs[0] === '-h') && rawArgs.length === 2) {
    await chalkInit()
    const nonHelpArgs = rawArgs.filter(arg => arg !== '--help' && arg !== '-h')
    nonHelpArgs.forEach(arg => {
      // match option by long or short
      const query = arg.replace(/^-*/, '')
      const option = cliOptions.find(
        option =>
          query === option.long ||
          query === option.short ||
          (query === `no-${option.long}` && option.type === 'boolean'),
      )
      if (option) {
        console.info(renderExtendedHelp(option) + '\n')
      } else {
        console.info(`Unknown option: ${arg}`)
      }
    })
    if (rawArgs.length - nonHelpArgs.length > 1) {
      console.info('Would you like some help with your help?')
    }
    process.exit(0)
  }

  // a set of options that only work in an rc config file, not on the command line
  const noCli = new Set(cliOptions.filter(option => option.cli === false).map(option => `--${option.long}`))

  // start commander program
  program
    .description('[filter] is a list or regex of package names to check (all others will be ignored).')
    .usage('[options] [filter]')
    // See: boolean optional arg below
    .configureHelp({
      optionTerm: option =>
        option.long && noCli.has(option.long)
          ? option.long.replace('--', '') + '*'
          : option.long === '--version'
            ? '-v, -V, --version'
            : option.flags.replace('[bool]', ''),
      optionDescription: option =>
        option.long === '--version'
          ? 'Output the version number of npm-check-updates.'
          : option.long === '--help'
            ? `You're lookin' at it.`
            : Help.prototype.optionDescription(option),
    })
    // add hidden -v alias for --V/--version
    .addOption(new Option('-v, --versionAlias').hideHelp())
    .on('option:versionAlias', () => {
      console.info(pkg.version)
      process.exit(0)
    })

  // add cli options
  cliOptions.forEach(({ long, short, arg, description, default: defaultValue, help, parse, type }) => {
    const flags = `${short ? `-${short}, ` : ''}--${long}${arg ? ` <${arg}>` : ''}`
    // format description for cli by removing inline code ticks
    // point to help in description if extended help text is available
    const descriptionFormatted = `${uncode(description)}${help ? ` Run "ncu --help ${long}" for details.` : ''}`

    // handle 3rd/4th argument polymorphism
    program.option(flags, descriptionFormatted, parse || defaultValue, parse ? defaultValue : undefined)

    // add --no- prefixed boolean options
    // necessary for overriding booleans set to true in the ncurc
    if (type === 'boolean') {
      program.addOption(new Option(`--no-${long}`).default(false).hideHelp())
    }
  })

  // set version option at the end
  program.version(pkg.version)

  // commander mutates its optionValues with program.parse
  // In order to call program.parse again and parse the rc file options, we need to clear commander's internal optionValues
  // Otherwise array options will be duplicated
  const defaultOptionValues = cloneDeep((program as any)._optionValues)
  program.parse(process.argv)

  const programOpts = program.opts()
  const programArgs = process.argv.slice(2)

  const { color, configFileName, configFilePath, global, packageFile, mergeConfig } = programOpts

  // Force color on all chalk instances.
  // See: /src/lib/chalk.ts
  await chalkInit(color)

  // load .ncurc
  // Do not load when tests are running (can be overridden if configFilePath is set explicitly, or --mergeConfig option specified)
  const rcResult =
    !process.env.NCU_TESTS || configFilePath || mergeConfig
      ? await getNcuRc({
          configFileName,
          configFilePath,
          global,
          packageFile,
          options: { ...programOpts, cli: true },
        })
      : null

  // override rc args with program args
  const rcArgs = (rcResult?.args || []).filter(
    (arg, i, args) =>
      (typeof arg !== 'string' || !arg.startsWith('-') || !programArgs.includes(arg)) &&
      (typeof args[i - 1] !== 'string' || !args[i - 1].startsWith('-') || !programArgs.includes(args[i - 1])),
  )

  // insert config arguments into command line arguments so they can all be parsed by commander
  const combinedArguments = [...process.argv.slice(0, 2), ...rcArgs, ...programArgs]

  // See defaultOptionValues comment above
  ;(program as any)._optionValues = defaultOptionValues
  program.parse(combinedArguments)
  const combinedProgramOpts = program.opts()

  // filter out undefined program options and combine cli options with config file options
  const options = {
    ...(rcResult && Object.keys(rcResult.config).length > 0 ? { rcConfigPath: rcResult.filePath } : null),
    ...pickBy(program.opts(), value => value !== undefined),
    args: program.args,
    ...(combinedProgramOpts.filter ? { filter: combinedProgramOpts.filter } : null),
    ...(combinedProgramOpts.reject ? { reject: combinedProgramOpts.reject } : null),
  }

  // NOTE: Options handling and defaults go in initOptions in index.js

  ncu(options, { cli: true })
})()
