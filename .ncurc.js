module.exports = {
  reject: [
    // ESM only modules
    // https://github.com/microsoft/TypeScript/issues/46452
    'find-up',
    'get-stdin',
    'globby',
    'p-map',
    'remote-git-tags',
  ],
}
