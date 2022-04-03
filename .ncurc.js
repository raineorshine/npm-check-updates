module.exports = {
  reject: [
    // ESM only modules
    // https://github.com/microsoft/TypeScript/issues/46452
    'chalk',
    'cint',
    'find-up',
    'get-stdin',
    'globby',
    'p-map',
    'remote-git-tags',
    'strip-ansi',
    // peer dependency errors on npm install
    'eslint',
    'eslint-plugin-jsdoc',
  ]
}
