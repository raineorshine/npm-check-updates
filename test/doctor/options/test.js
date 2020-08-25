const returnVersion = require('ncu-test-return-version')
const v = returnVersion()

// pass on < 2
if (v.startsWith('0')) {
  console.log('Works with v0.x :)')
}
else if (v.startsWith('1')) {
  console.log('Works with v1.x :)')
}
// break on v2.x
else if (v.startsWith('2')) {
  throw new Error('Breaks with v2.x :(')
}
