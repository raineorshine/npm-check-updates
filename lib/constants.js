const supportedVersionTargets = ['latest', 'newest', 'greatest', 'minor', 'patch']

const doctorHelpText = `Usage: ncu --doctor [-u] [options]

Iteratively installs upgrades and runs tests to identify breaking upgrades. Add "-u" to execute (modifies your package file, lock file, and node_modules).

To be more precise:
1. Runs "npm install" and "npm test" to ensure tests are currently passing.
2. Runs "ncu -u" to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. Prints broken upgrades with test error.
7. Saves working upgrades to package.json.

Example:

$ ncu --doctor -u
Running tests before upgrading
npm install
npm run test
Upgrading all dependencies and re-running tests
ncu -u
npm install
npm run test
Tests failed
Identifying broken dependencies
npm install
npm install --no-save react@16.0.0
npm run test
  ✓ react 15.0.0 → 16.0.0
npm install --no-save react-redux@7.0.0
npm run test
  ✗ react-redux 6.0.0 → 7.0.0

/projects/myproject/test.js:13
  throw new Error('Test failed!')
  ^

npm install --no-save react-dnd@11.1.3
npm run test
  ✓ react-dnd 10.0.0 → 11.1.3
Saving partially upgraded package.json
`

module.exports = { doctorHelpText, supportedVersionTargets }
