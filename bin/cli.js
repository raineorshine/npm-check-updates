#!/usr/bin/env node

'use strict'

const program = require('commander')
const _ = require('lodash')
const updateNotifier = require('update-notifier')
const ncu = require('../lib/')
const pkg = require('../package.json')
const cliOptions = require('../lib/cli-options')

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
    const option = cliOptions.find(({ long }) => `--${long}` === arg)
    if (option) {
      console.log(`Usage: ncu --${option.long}`)
      if (option.short) {
        console.log(`       ncu -${option.short}`)
      }
      if (option.default !== undefined) {
        console.log(`Default: ${option.default}`)
      }
      if (option.help) {
        console.log(`\n${option.help}`)
      }
      else if (option.description) {
        console.log(`\n${option.description}`)
      }
    }
    else {
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
  program.option(`${short ? `-${short}, ` : ''}--${long}${arg ? ` <${arg}>` : ''}`, description, parse || defaultValue, parse ? defaultValue : undefined))

// set version option at the end
program.version(pkg.version)

program.parse(process.argv)

const { configFileName, configFilePath, packageFile } = program

// load .ncurc
// NOTE: Do not load .ncurc from project directory when tests are running
// Can be overridden if configFilePath is set explicitly
const rcResult = !process.env.NCU_TESTS || configFilePath
  ? ncu.getNcurc({ configFileName, configFilePath, packageFile })
  : null

// combine command line arguments with config file arguments
const combinedArguments = rcResult
  ? [
    ...process.argv.slice(0, 2),
    ...rcResult.args,
    ...process.argv.slice(2),
  ]
  : process.argv

program.parse(combinedArguments)

// filter out undefined program options and combine with config file options
const options = {
  ...rcResult && Object.keys(rcResult.config).length > 0
    ? { rcConfigPath: rcResult.filePath }
    : null,
  ..._.pickBy(program.opts(), value => value !== undefined),
  args: program.args,
  ...program.filter ? { filter: program.filter } : null,
  cli: true,
}

ncu.run(options)
