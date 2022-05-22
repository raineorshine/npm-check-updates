#!/usr/bin/env node

import { program } from 'commander'
import _ from 'lodash'
import updateNotifier from 'update-notifier'
import ncu from '../index'
import pkg from '../../package.json'
import cliOptions, { cliOptionsMap } from '../cli-options'
import getNcuRc from '../lib/getNcuRc'

// check if a new version of ncu is available and print an update notification
const notifier = updateNotifier({ pkg })
if (notifier.update && notifier.update.latest !== pkg.version) {
  notifier.notify({ defer: false, isGlobal: true })
}

// manually detect option-specific help
// https://github.com/raineorshine/npm-check-updates/issues/787
const rawArgs = process.argv.slice(2)
if (rawArgs.includes('--help') && rawArgs.length > 1) {
  const nonHelpArgs = rawArgs.filter(arg => arg !== '--help')
  nonHelpArgs.forEach(arg => {
    const option = cliOptionsMap[arg.slice(2)]
    if (option) {
      console.log(`Usage: ncu --${option.long}`)
      if (option.short) {
        console.log(`       ncu -${option.short}`)
      }
      if (option.default !== undefined && !(Array.isArray(option.default) && option.default.length === 0)) {
        console.log(`Default: ${option.default}`)
      }
      if (option.help) {
        console.log(`\n${option.help}`)
      } else if (option.description) {
        console.log(`\n${option.description}`)
      }
    } else {
      console.log(`Unknown option: ${arg}`)
    }
  })
  if (rawArgs.length - nonHelpArgs.length > 1) {
    console.log('Would you like some help with your help?')
  }
  process.exit(0)
}

// start commander program
program
  .description('[filter] is a list or regex of package names to check (all others will be ignored).')
  .usage('[options] [filter]')

// add cli options
cliOptions.forEach(({ long, short, arg, description, default: defaultValue, parse }) =>
  // handle 3rd/4th argument polymorphism
  program.option(
    `${short ? `-${short}, ` : ''}--${long}${arg ? ` <${arg}>` : ''}`,
    description,
    parse || defaultValue,
    parse ? defaultValue : undefined,
  ),
)

// set version option at the end
program.version(pkg.version)

program.parse(process.argv)

let programOpts = program.opts()

const { configFileName, configFilePath, packageFile, mergeConfig } = programOpts

// load .ncurc
// Do not load when global option is set
// Do not load when tests are running (an be overridden if configFilePath is set explicitly, or --mergeConfig option specified)
const rcResult =
  !programOpts.global && (!process.env.NCU_TESTS || configFilePath || mergeConfig)
    ? getNcuRc({ configFileName, configFilePath, packageFile })
    : null

// insert config arguments into command line arguments so they can all be parsed by commander
const combinedArguments = [...process.argv.slice(0, 2), ...(rcResult?.args || []), ...process.argv.slice(2)]

program.parse(combinedArguments)
programOpts = program.opts()

// filter out undefined program options and combine cli options with config file options
const options = {
  ...(rcResult && Object.keys(rcResult.config).length > 0 ? { rcConfigPath: rcResult.filePath } : null),
  ..._.pickBy(program.opts(), value => value !== undefined),
  args: program.args,
  ...(programOpts.filter ? { filter: programOpts.filter } : null),
}

// NOTE: Options handling and defaults go in initOptions in index.js

ncu(options, { cli: true })
