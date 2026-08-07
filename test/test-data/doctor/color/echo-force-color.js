// exits non-zero so doctor bails after the first test run instead of installing again
console.log(`FORCE_COLOR=${process.env.FORCE_COLOR ?? '<unset>'}`)
process.exit(1)
