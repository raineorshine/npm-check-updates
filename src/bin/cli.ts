#!/usr/bin/env node
import { program } from 'commander'
import pickBy from 'lodash/pickBy'
import pkg from '../../package.json'
import cliOptions from '../cli-options'
import ncu from '../index'
import { chalkInit } from '../lib/chalk'
import getNcuRc from '../lib/getNcuRc' // async global contexts are only available in esm modules -> function

;(async () => {
  // importing update-notifier dynamically as esm modules are only
  // allowed to be dynamically imported inside of cjs modules.
  const { default: updateNotifier } = await import('update-notifier')

  // check if a new version of ncu is available and print an update notification
  const notifier = updateNotifier({ pkg })
  if (notifier.update && notifier.update.latest !== pkg.version) {
    notifier.notify({ defer: false, isGlobal: true })
  }

  // manually detect option-specific help
  // https://github.com/raineorshine/npm-check-updates/issues/787
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes('--help') && rawArgs.length > 1) {
    const color = rawArgs.includes('--color')
    await chalkInit(color)
    const nonHelpArgs = rawArgs.filter(arg => arg !== '--help')
    nonHelpArgs.forEach(arg => {
      // match option by long or short
      const query = arg.replace(/^-*/, '')
      const option = cliOptions.find(option => option.long === query || option.short === query)
      if (option) {
        console.info(`Usage: ncu --${option.long}`)
        if (option.short) {
          console.info(`       ncu -${option.short}`)
        }
        if (option.default !== undefined && !(Array.isArray(option.default) && option.default.length === 0)) {
          console.info(`Default: ${option.default}`)
        }
        if (option.help) {
          const helpText = typeof option.help === 'function' ? option.help() : option.help
          console.info(`\n${helpText}`)
        } else if (option.description) {
          console.info(`\n${option.description}`)
        }
      } else {
        console.info(`Unknown option: ${arg}`)
      }
    })
    if (rawArgs.length - nonHelpArgs.length > 1) {
      console.info('Would you like some help with your help?')
    }
    process.exit(0)
  }

  // start commander program
  program
    .description('[filter] is a list or regex of package names to check (all others will be ignored).')
    .usage('[options] [filter]')

  // add cli options
  cliOptions.forEach(({ long, short, arg, description, default: defaultValue, help, parse }) =>
    // handle 3rd/4th argument polymorphism
    program.option(
      `${short ? `-${short}, ` : ''}--${long}${arg ? ` <${arg}>` : ''}`,
      // point to help in description if extended help text is available
      `${description}${help ? ` Run "ncu --help --${long}" for details.` : ''}`,
      parse || defaultValue,
      parse ? defaultValue : undefined,
    ),
  )

  // set version option at the end
  program.version(pkg.version)

  program.parse(process.argv)

  let programOpts = program.opts()

  const { color, configFileName, configFilePath, packageFile, mergeConfig } = programOpts

  // Force color on all chalk instances.
  // See: /src/lib/chalk.ts
  await chalkInit(color)

  // load .ncurc
  // Do not load when global option is set
  // Do not load when tests are running (an be overridden if configFilePath is set explicitly, or --mergeConfig option specified)
  const rcResult =
    !programOpts.global && (!process.env.NCU_TESTS || configFilePath || mergeConfig)
      ? await getNcuRc({ configFileName, configFilePath, packageFile, color })
      : null

  // insert config arguments into command line arguments so they can all be parsed by commander
  const combinedArguments = [...process.argv.slice(0, 2), ...(rcResult?.args || []), ...process.argv.slice(2)]

  program.parse(combinedArguments)
  programOpts = program.opts()

  // filter out undefined program options and combine cli options with config file options
  const options = {
    ...(rcResult && Object.keys(rcResult.config).length > 0 ? { rcConfigPath: rcResult.filePath } : null),
    ...pickBy(program.opts(), value => value !== undefined),
    args: program.args,
    ...(programOpts.filter ? { filter: programOpts.filter } : null),
  }

  // NOTE: Options handling and defaults go in initOptions in index.js

  ncu(options, { cli: true })
})()
