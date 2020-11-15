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
  filter: program.filter,
  cli: true,
}

ncu.run(options)
