#!/usr/bin/env node

'use strict'

const fs = require('fs')
const spawn = require('spawn-please')

/** Extracts CLI options from the bin output. */
const readOptions = async () => {
  const optionsBinLabel = 'Options:\n'
  const helpOutput = await spawn('node', ['./build/src/bin/cli.js', '--help'])
  return helpOutput.slice(helpOutput.indexOf(optionsBinLabel) + optionsBinLabel.length)
  // outdent
    .split('\n').map(s => s.slice(2)).join('\n')
}

/** Replaces the "Options" section of the README with direct output from "ncu --help". */
const writeReadme = helpOptionsNew => {

  const optionsLabelStart = '## Options\n\n```text\n'
  const optionsLabelEnd = '```'

  // find insertion point for options into README
  const readme = fs.readFileSync('README.md', 'utf8')
  const optionsLabelStartIndex = readme.indexOf(optionsLabelStart)
  const optionsStart = optionsLabelStartIndex + optionsLabelStart.length
  const optionsEnd = readme.indexOf(optionsLabelEnd, optionsStart)

  // insert new options into README
  const readmeNew = readme.slice(0, optionsStart)
  + helpOptionsNew
  + readme.slice(optionsEnd)
  fs.writeFileSync('README.md', readmeNew)
}

;(async () => {

  const helpOptionsNew = await readOptions()
  writeReadme(helpOptionsNew)

})()
