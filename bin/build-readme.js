/** Replaces the "Options" section of the README with direct output from "ncu --help". */

(async () => {

  const fs = require('fs')
  const spawn = require('spawn-please')

  const optionsLabelStart = '## Options\n\n```text\n'
  const optionsLabelEnd = '```'
  const optionsBinLabel = 'Options:\n'

  // extract options from bin output
  const helpOutput = await spawn('./bin/ncu.js', ['--help'])
  const helpOptionsNew = helpOutput.slice(helpOutput.indexOf(optionsBinLabel) + optionsBinLabel.length)
  // outdent
    .split('\n').map(s => s.slice(2)).join('\n')

  // find insertion point for options into README
  const readme = fs.readFileSync('./README.md', 'utf8')
  const optionsLabelStartIndex = readme.indexOf(optionsLabelStart)
  const optionsStart = optionsLabelStartIndex + optionsLabelStart.length
  const optionsEnd = readme.indexOf(optionsLabelEnd, optionsStart)

  // insert new options into README
  const readmeNew = readme.slice(0, optionsStart)
  + helpOptionsNew
  + readme.slice(optionsEnd)
  fs.writeFileSync('./README.md', readmeNew)

})()
