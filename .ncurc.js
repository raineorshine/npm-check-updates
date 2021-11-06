module.exports = {
  reject: [

    'cint',

    // breaking changes (just need to spend some time to fix them)
    'commander',

    // "Must use import to load ES Module"
    // These can be removed once the tests are converted to Typescript
    'find-up',
    'get-stdin',
    'globby',
    'p-map',
    'remote-git-tags',
    'strip-ansi',

  ]
}
