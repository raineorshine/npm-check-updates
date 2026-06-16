#!/usr/bin/env node
import { Help, Option, program } from 'commander'
import pkg from '../../package.json' with { type: 'json' }
import cliOptions, { cliOptionsMap, renderExtendedHelp } from '../cli-options.ts'
import ncu from '../index.ts'
import { chalkInit } from '../lib/chalk.ts'
// async global contexts are only available in esm modules -> function
import getNcuRc from '../lib/getNcuRc.ts'
import notifyUpdate from '../lib/notifyUpdate.ts'
import { pickBy } from '../lib/utils/pick.ts'
import { type RunOptions } from '../types/RunOptions.ts'

const optionVersionDescription = 'Output the version number of npm-check-updates.'

/** Removes inline code ticks. */
const uncode = (s: string) => s.replace(/`/g, '')

;(async () => {
  notifyUpdate()

  // manually detect option-specific help
  // https://github.com/raineorshine/npm-check-updates/issues/787
  const rawArgs = process.argv.slice(2)
  const indexHelp = rawArgs.findIndex(arg => arg === '--help' || arg === '-h')
  if (indexHelp !== -1 && rawArgs[indexHelp + 1]) {
    const helpOption = rawArgs[indexHelp + 1].replace(/^-*/, '')
    if (helpOption === 'help' || helpOption === 'h') {
      console.info('Would you like some help with your help?')
    } else {
      chalkInit()
      const nonHelpArgs = [...rawArgs.slice(0, indexHelp), ...rawArgs.slice(indexHelp + 1)]
      for (const arg of nonHelpArgs) {
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
        } else if (query === 'version' || query === 'v' || query === 'V') {
          console.info(
            renderExtendedHelp({
              long: 'version',
              short: 'v',
              description: optionVersionDescription,
              // do not pass boolean or it will print --no-version
              type: 'string',
            }) + '\n',
          )
        } else {
          console.info(`Unknown option: ${arg}`)
        }
      }
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
            ? // add -v to version help to cover the alias added below
              '-v, -V, --version'
            : option.flags.replace('[bool]', ''),
      optionDescription: option =>
        option.long === '--version'
          ? optionVersionDescription
          : option.long === '--help'
            ? `You're lookin' at it. Run "ncu --help <option>" for a specific option.`
            : Help.prototype.optionDescription(option),
    })
    // add hidden -v alias for --V/--version
    .addOption(new Option('-v, --versionAlias').hideHelp())
    .on('option:versionAlias', () => {
      console.info(pkg.version)
      process.exit(0)
    })

  // add cli options
  for (const { long, short, arg, description, default: defaultValue, help, parse, type } of cliOptions) {
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
  }

  // set version option at the end
  program.version(pkg.version)

  // commander mutates its optionValues with program.parse
  // In order to call program.parse again and parse the rc file options, we need to clear commander's internal optionValues
  // Otherwise array options will be duplicated
  const defaultOptionValues = structuredClone((program as any)._optionValues)
  program.allowExcessArguments(true)
  program.parse(process.argv)

  const programOpts = program.opts()
  const programArgs = process.argv.slice(2)

  const { color, configFileName, configFilePath, global, packageFile, mergeConfig } = programOpts

  // Force color on all chalk instances.
  // See: /src/lib/chalk.ts
  chalkInit(color)

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

  // save raw values for all cli arguments
  const raw: Partial<Record<keyof RunOptions, any>> = {}
  const args = combinedArguments.slice(2)

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (typeof arg !== 'string' || !arg.startsWith('-')) {
      continue
    }

    const key = arg.replace(/^--?(no-)?/, '')
    const option = cliOptionsMap[key]

    if (option) {
      const property = option.long as keyof RunOptions
      if (option.arg) {
        raw[property] = i + 1 < args.length ? args[i + 1] : true
        i++
      } else if (option.type === 'boolean') {
        raw[property] = !arg.startsWith('--no-')
      } else {
        raw[property] = true
      }
    }
  }

  // See defaultOptionValues comment above
  ;(program as any)._optionValues = defaultOptionValues
  program.parse(combinedArguments)
  const combinedProgramOpts = program.opts()

  // filter out undefined program options and combine cli options with config file options
  const options = {
    ...(rcResult && Object.keys(rcResult.config).length > 0 ? { rcConfigPath: rcResult.filePath } : null),
    ...pickBy(program.opts(), (value: unknown) => value !== undefined),
    args: program.args,
    raw,
    ...(combinedProgramOpts.filter ? { filter: combinedProgramOpts.filter } : null),
    ...(combinedProgramOpts.reject ? { reject: combinedProgramOpts.reject } : null),
  }

  // NOTE: Options handling and defaults go in initOptions in index.js

  ncu(options, { cli: true })
})()
