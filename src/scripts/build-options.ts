import fs from 'fs/promises'
import spawn from 'spawn-please'
import cliOptions, { CLIOption, renderExtendedHelp } from '../cli-options'
import { chalkInit } from '../lib/chalk'

const INJECT_HEADER =
  '<!-- Do not edit this section by hand. It is auto-generated in build-options.ts. Run "npm run build" or "npm run build:options" to build. -->'

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
      .trim()
  )
}

/** Replaces the "Options" and "Advanced Options" sections of the README with direct output from "ncu --help". */
const injectReadme = async () => {
  const { default: stripAnsi } = await import('strip-ansi')
  const helpOptions = await readOptions()
  let readme = await fs.readFile('README.md', 'utf8')

  // inject options into README
  const optionsStart = readme.indexOf('<!-- BEGIN Options -->') + '<!-- BEGIN Options -->'.length
  const optionsEnd = readme.indexOf('<!-- END Options -->', optionsStart)
  readme = `${readme.slice(0, optionsStart)}
${INJECT_HEADER}

\`\`\`text
${helpOptions}
\`\`\`

${readme.slice(optionsEnd)}`

  // Inject advanced options into README
  // Even though chalkInit has a colorless option, we need stripAnsi to remove the ANSI characters frim the output of cli-table
  await chalkInit()
  const advancedOptionsStart =
    readme.indexOf('<!-- BEGIN Advanced Options -->') + '<!-- BEGIN Advanced Options -->'.length
  const advancedOptionsEnd = readme.indexOf('<!-- END Advanced Options -->', advancedOptionsStart)
  readme = `${readme.slice(0, advancedOptionsStart)}
${INJECT_HEADER}

${cliOptions
  .filter(option => option.help)
  .map(
    option => `## ${option.long}

${stripAnsi(renderExtendedHelp(option))}
`,
  )
  .join('\n')}
${readme.slice(advancedOptionsEnd)}`

  return readme
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
  const header = `/** This file is generated automatically from the options specified in /src/cli-options.ts. Do not edit manually. Run "npm run build" or "npm run build:options" to build. */
import { FilterFunction } from './FilterFunction'
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
  await fs.writeFile('README.md', await injectReadme())
  await fs.writeFile('src/types/RunOptions.ts', renderRunOptions(cliOptions))
})()
