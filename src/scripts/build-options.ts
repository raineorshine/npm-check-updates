import fs from 'fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import prettier from 'prettier'
import { createGenerator } from 'ts-json-schema-generator'
import cliOptions, { renderExtendedHelp } from '../cli-options'
import { chalkInit, getChalk } from '../lib/chalk'
import type CLIOption from '../types/CLIOption'

const INJECT_HEADER =
  '<!-- Do not edit this section by hand. It is auto-generated in build-options.ts. Run "npm run build" or "npm run build:options" to build. -->'

/** Replaces markdown code ticks with <code>...</code> tag. */
const codeHtml = (code: string) => code.replace(/`(.+?)`/g, '<code>$1</code>')

/** Replaces the "Options" and "Advanced Options" sections of the README with direct output from "ncu --help". */
const injectReadme = async () => {
  let readme = await fs.readFile('README.md', 'utf8')
  const optionRows = cliOptions
    .map(option => {
      return `  <tr>
    <td>${option.help ? `<a href="#${option.long.toLowerCase()}">` : ''}${option.short ? `-${option.short}, ` : ''}${
      option.cli !== false ? '--' : ''
    }${option.long}${option.arg ? ` &lt;${option.arg}&gt;` : ''}${option.help ? '</a>' : ''}</td>
    <td>${codeHtml(option.description)}${option.default ? ` (default: ${JSON.stringify(option.default)})` : ''}</td>
  </tr>`
    })
    .join('\n')

  // inject options into README
  const optionsStart = readme.indexOf('<!-- BEGIN Options -->') + '<!-- BEGIN Options -->'.length
  const optionsEnd = readme.indexOf('<!-- END Options -->', optionsStart)
  readme = `${readme.slice(0, optionsStart)}
${INJECT_HEADER}

<table>
${optionRows}
</table>

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

${stripAnsi(renderExtendedHelp(option, { markdown: true }))}
`,
  )
  .join('\n')}
${readme.slice(advancedOptionsEnd)}`

  return readme
}

/** Renders a single CLI option for a type definition file. */
const renderOption = (option: CLIOption<unknown>) => {
  // deepPatternFix needs to be escaped; otherwise, it will break the block comment
  const description = option.long === 'deep' ? option.description.replace('**/', '**\\/') : option.description

  // pre must be internally typed as number and externally typed as boolean to maintain compatibility with the CLI option and the RunOption
  const type = option.long === 'pre' ? 'boolean' : option.type

  const defaults =
    // do not render default empty arrays
    option.default && (!Array.isArray(option.default) || option.default.length > 0)
      ? `\n   *\n   * @default ${JSON.stringify(option.default)}\n  `
      : ''

  // all options are optional
  return `  /** ${description}${option.help ? ` Run "ncu --help --${option.long}" for details.` : ''}${defaults} */
  ${option.long}?: ${type}
`
}

/** Generate /src/types/RunOptions from cli-options so there is a single source of truth. */
const generateRunOptions = (options: CLIOption<unknown>[]) => {
  const header = `/** This file is generated automatically from the options specified in /src/cli-options.ts. Do not edit manually. Run "npm run build" or "npm run build:options" to build. */
import type { CooldownFunction } from './CooldownFunction'
import type { FilterFunction } from './FilterFunction'
import type { FilterResultsFunction } from './FilterResultsFunction'
import type { GroupFunction } from './GroupFunction'
import type { PackageFile } from './PackageFile'
import type { TargetFunction } from './TargetFunction'

/** Options that can be given on the CLI or passed to the ncu module to control all behavior. */
export interface RunOptions {
`

  const footer = '}\n'

  const optionsTypeCode = options.map(renderOption).join('\n')

  const output = `${header}${optionsTypeCode}${footer}`

  return output
}

/** Generates a JSON schema for the ncurc file. */
const generateRunOptionsJsonSchema = (): string => {
  const config = {
    path: 'src/types/RunOptions.ts',
    tsconfig: 'tsconfig.json',
    type: 'RunOptions',
  }

  const schema = createGenerator(config).createSchema(config.type)
  return JSON.stringify(schema, null, 2)
}

/** generate and save README.md, RunOptions.ts, RunOptions.json */
export async function buildOptions(): Promise<void> {
  const chalk = getChalk(true)
  const logPrefix = chalk.cyan('[build-options]')
  console.log(logPrefix, chalk.green('Generating RunOptions type definition and JSON schema...'))

  // Generate TypeScript
  await fs.writeFile('src/types/RunOptions.ts', generateRunOptions(cliOptions))

  // Generate JSON Schema
  const schema = generateRunOptionsJsonSchema()
  const prettierConfig = await prettier.resolveConfig(process.cwd())
  const formattedSchema = await prettier.format(schema, {
    ...prettierConfig,
    parser: 'json',
  })
  await fs.writeFile('src/types/RunOptions.json', formattedSchema)

  // Update README (parallel with last write for speed)
  console.log(logPrefix, chalk.green('Updating README.md...'))
  const readmePromise = injectReadme().then(readme => fs.writeFile('README.md', readme))

  await Promise.all([readmePromise, fs.writeFile('src/types/RunOptions.json', formattedSchema)])

  console.log(logPrefix, chalk.green('Done!\n'))
}

const isDirectRun = import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isDirectRun) {
  buildOptions().catch(err => {
    console.error(err?.stack || err)
    process.exit(1)
  })
}
