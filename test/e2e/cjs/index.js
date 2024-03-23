/** NOTE: This script is copied into a temp directory by the e2e test and dependencies are installed from the local verdaccio registry. */

const ncu = require('npm-check-updates')
const assert = require('assert')

const registry = process.env.REGISTRY || 'http://localhost:4873'

// must exit with error code on unhandledRejection, otherwise script will exit with 0 if an assertion fails in the async block
process.on('unhandledRejection', (reason, p) => {
  process.exit(1)
})

// test
;(async () => {
  const upgraded = await ncu.run({
    // --pre 1 to ensure that an upgrade is always suggested even if npm-check-updates is on a prerelease version
    pre: true,
    packageData: JSON.stringify({
      dependencies: {
        'npm-check-updates': '1.0.0',
      },
    }),
    registry,
  })

  console.info(upgraded)

  assert.notStrictEqual(upgraded['npm-check-updates'], '1.0.0', 'npm-check-updates should be upgraded')
})()
