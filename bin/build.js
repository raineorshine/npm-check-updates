const fs = require('fs')
const path = require('path')
const spawn = require('spawn-please')
const cliOptions = require('../lib/cli-options')

/** Extracts CLI options from the bin output. */
const readOptions = async () => {
  const optionsBinLabel = 'Options:\n'
  const helpOutput = await spawn('./bin/cli.js', ['--help'])
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

/** Writes CLI options to type definitions file (npm-check-updates.d.ts). */
const writeTypeDefinitions = helpOptionsNew => {

  const typedefsStart = `declare namespace ncu {

  interface RunOptions {
`
  const typedefsEnd = `
  }

  type RunResults = Record<string, string>

  function run(options?: RunOptions): Promise<RunResults>
}

export = ncu
`

  // parse commander values
  const optionTypes = cliOptions.map(({ name, description, default: defaultValue, type: typeValue }) => {
    const tsName = name.replace(/(?:-\w, )?--([^ ]+)(?: <.*>)?/, (_, m) => m)
    const tsType = typeValue || (
      defaultValue ? typeof defaultValue
      : name.includes(' <n>') || name.includes(' <ms>') ? 'number'
      : !name.includes(' <') ? 'boolean'
      : 'string'
    )
    const tsDefault = defaultValue ? ' (default: ' + JSON.stringify(defaultValue) + ')' : ''
    return `
    /** ${description}${tsDefault} */
    ${tsName}?: ${tsType};
`
  })
    .join('')

  const typedefsNew = typedefsStart + optionTypes + typedefsEnd
  fs.writeFileSync(path.join(__dirname, '../lib/npm-check-updates.d.ts'), typedefsNew)
}

;(async () => {

  const helpOptionsNew = await readOptions()
  writeReadme(helpOptionsNew)
  writeTypeDefinitions(helpOptionsNew)

})()
