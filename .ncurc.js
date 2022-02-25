module.exports = {
  reject: [
    // "If you use TypeScript, you will want to stay on Chalk 4 until TypeScript 4.6 is out."
    // https://github.com/microsoft/TypeScript/issues/46452
    'chalk',
    'cint',
    // eslint-plugin-promise does not support eslint v8 yet
    // https://github.com/xjamundx/eslint-plugin-promise/pull/219
    'eslint',
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
