import fs from 'fs/promises'
import spawn from 'spawn-please'
import cliOptions, { CLIOption } from '../cli-options'

/** Extracts CLI options from the bin output. */
const readOptions = async () => {
  const optionsBinLabel = 'Options:\n'
  const helpOutput: string = await spawn('node', ['./build/src/bin/cli.js', '--help'])
  return (
    helpOutput
      .slice(helpOutput.indexOf(optionsBinLabel) + optionsBinLabel.length)
      // outdent
      .split('\n')
      .map((s: string) => s.slice(2))
      .join('\n')
  )
}

/** Replaces the "Options" section of the README with direct output from "ncu --help". */
const injectReadme = async (helpOptions: string) => {
  const optionsLabelStart = '## Options\n\n```text\n'
  const optionsLabelEnd = '```'

  // find insertion point for options into README
  const readme = await fs.readFile('README.md', 'utf8')
  const optionsLabelStartIndex = readme.indexOf(optionsLabelStart)
  const optionsStart = optionsLabelStartIndex + optionsLabelStart.length
  const optionsEnd = readme.indexOf(optionsLabelEnd, optionsStart)

  // insert new options into README
  const readmeNew = readme.slice(0, optionsStart) + helpOptions + readme.slice(optionsEnd)
  return readmeNew
}

/** Renders a single CLI option for a type definition file. */
const renderOption = (option: CLIOption<unknown>) => {
  // deepPatternFix needs to be escaped, otherwise it will break the block comment
  const description = option.long === 'deep' ? option.description.replace('**/', '**\\/') : option.description

  // pre must be internally typed as number and externally typed as boolean to maintain compatibility with the CLI option and the RunOption
  const type = option.long === 'pre' ? 'boolean' : option.type

  const defaults =
    // do not render default empty arrays
    option.default && (!Array.isArray(option.default) || option.default.length > 0)
      ? ` (default: ${JSON.stringify(option.default)})`
      : ''

  // all options are optional
  return `  /** ${description}${option.help ? ` Run "ncu --help --${option.long}" for details.` : ''}${defaults} */
  ${option.long}?: ${type}
`
}

/** Generate /src/types/RunOptions from cli-options so there is a single source of truth. */
const renderRunOptions = (options: CLIOption<unknown>[]) => {
  const header = `/** This file is generated automatically from the options specified in /src/cli-options.ts. Do not edit manually. Run "npm run build:options" to build. */
import { FilterFunction } from './FilterFunction'
import { FilterMetaFunction } from './FilterMetaFunction'
import { GroupFunction } from './GroupFunction'
import { PackageFile } from './PackageFile'
import { TargetFunction } from './TargetFunction'

/** Options that can be given on the CLI or passed to the ncu module to control all behavior. */
export interface RunOptions {
`

  const footer = '}\n'

  const optionsTypeCode = options.map(renderOption).join('\n')

  const output = `${header}${optionsTypeCode}${footer}`

  return output
}

;(async () => {
  const helpOptionsString = await readOptions()
  await fs.writeFile('README.md', await injectReadme(helpOptionsString))
  await fs.writeFile('src/types/RunOptions.ts', renderRunOptions(cliOptions))
})()
