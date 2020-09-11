const supportedVersionTargets = ['latest', 'newest', 'greatest', 'minor', 'patch']

const doctorHelpText = `Usage: ncu --doctor [-u] [options]

Iteratively installs upgrades and runs tests to identify breaking upgrades. Add "-u" to execute (modifies your package file, lock file, and node_modules).

To be more precise:
1. Runs "npm install" and "npm test" to ensure tests are currently passing.
2. Runs "ncu -u" to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. When the breaking upgrade is found, saves partially upgraded package.json (not including the breaking upgrade) and exits.

Example:

$ ncu --doctor -u
npm install
npm run test
ncu -u
npm install
npm run test
Failing tests found:
/projects/myproject/test.js:13
  throw new Error('Test failed!')
  ^
Now let's identify the culprit, shall we?
Restoring package.json
Restoring package-lock.json
npm install
npm install --no-save react@16.0.0
npm run test
  ✓ react 15.0.0 → 16.0.0
npm install --no-save react-redux@7.0.0
npm run test
  ✗ react-redux 6.0.0 → 7.0.0
Saving partially upgraded package.json
`

module.exports = { doctorHelpText, supportedVersionTargets }
