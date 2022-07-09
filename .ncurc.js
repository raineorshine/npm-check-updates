module.exports = {
  reject: [
    // ESM only modules
    // https://github.com/microsoft/TypeScript/issues/46452
    'chalk',
    'find-up',
    'get-stdin',
    'globby',
    'p-map',
    'remote-git-tags',
  ],
}
