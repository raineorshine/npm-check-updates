// Updates the Node.js version matrix in .github/workflows/test.yml by adding any
// new even (LTS-line) major versions published in the official Node.js release
// schedule that are newer than the highest version already in the matrix.
//
// Source of truth: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
//
// Run via the update-node-versions workflow on a schedule. Writes a summary of
// the versions that were added to GITHUB_OUTPUT (key: added) so the workflow can
// decide whether to open a pull request.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEDULE_URL = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testYmlPath = path.resolve(__dirname, '../workflows/test.yml')

/** Set a key/value pair on the GitHub Actions step output, if running in CI. */
const setOutput = (key, value) => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  }
}

/** Adds new even Node.js versions to the test.yml matrix and reports them via GITHUB_OUTPUT. */
const main = async () => {
  // Fetch the official Node.js release schedule.
  const response = await fetch(SCHEDULE_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SCHEDULE_URL}: ${response.status} ${response.statusText}`)
  }
  const schedule = await response.json()

  // Extract even major versions (the LTS lines), e.g. "v20" -> 20.
  const scheduledEvenVersions = Object.keys(schedule)
    .map(key => Number(key.replace(/^v/, '')))
    .filter(version => Number.isInteger(version) && version % 2 === 0)

  // Read the current matrix from test.yml.
  const testYml = readFileSync(testYmlPath, 'utf8')
  const matrixRegex = /^(\s*node:\s*)\[([^\]]*)\]/m
  const match = testYml.match(matrixRegex)
  if (!match) {
    throw new Error(`Could not find the node version matrix in ${testYmlPath}`)
  }

  const currentVersions = match[2]
    .split(',')
    .map(part => Number(part.trim()))
    .filter(version => Number.isInteger(version))

  const highestCurrent = Math.max(...currentVersions)

  // Only add even versions that are newer than the highest version already in the
  // matrix, so that end-of-life versions are never reintroduced.
  const newVersions = scheduledEvenVersions
    .filter(version => version > highestCurrent && !currentVersions.includes(version))
    .sort((a, b) => a - b)

  if (newVersions.length === 0) {
    console.log('Node.js version matrix is already up to date.')
    setOutput('added', '')
    return
  }

  const updatedVersions = [...currentVersions, ...newVersions].sort((a, b) => a - b)
  const updatedTestYml = testYml.replace(matrixRegex, `$1[${updatedVersions.join(', ')}]`)
  writeFileSync(testYmlPath, updatedTestYml)

  console.log(`Added Node.js version(s) to the test matrix: ${newVersions.join(', ')}`)
  setOutput('added', newVersions.join(', '))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
