#!/usr/bin/env node

'use strict'

const program = require('commander')
const updateNotifier = require('update-notifier')
const _ = require('lodash')
const ncu = require('../lib/npm-check-updates')
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
cliOptions.forEach(({ name, description, default: defaultValue, parse }) =>
  // handle 3rd/4th argument polymorphism
  program.option(name, description, parse || defaultValue, parse ? defaultValue : undefined))

// set version option at the end
program.version(pkg.version)

program.parse(process.argv)

const { configFileName, configFilePath, packageFile } = program

// load .ncurc
// NOTE: Do not load .ncurc from project directory when tests are running
// Can be overridden if configFilePath is set explicitly
let rcArguments = []
if (!process.env.NCU_TESTS || configFilePath) {
  const rcConfig = ncu.getNcurc({
    configFileName,
    configFilePath,
    packageFile
  })
  rcArguments = rcConfig ?
    _.flatten(_.map(rcConfig, (value, name) =>
      value === true ? [`--${name}`] : [`--${name}`, value]
    )) : []

}
const combinedArguments = process.argv.slice(0, 2).concat(rcArguments, process.argv.slice(2))

program.parse(combinedArguments)

program.cli = true
program.filter = program.args.join(' ') || program.filter

ncu.run(program)
