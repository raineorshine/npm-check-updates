module.exports = {
  reject: [

    'cint',

    // breaking changes (just need to spend some time to fix them)
    'commander',

    // sindresorhus switched to pure ESM (node >= 12)
    'get-stdin',
    'p-map',

  ]
}
