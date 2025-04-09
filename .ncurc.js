module.exports = {
  format: 'group',
  reject: [
    // Need to make a breaking change of -ws to --ws
    // https://github.com/tj/commander.js/pull/2312
    'commander',
    // breaking
    '@types/chai-as-promised',
    '@types/node',
    'chai-as-promised',
    'eslint',
    'eslint-plugin-n',
    'eslint-plugin-promise',
    // esm only modules
    '@types/chai',
    '@types/remote-git-tags',
    'camelcase',
    'find-up',
    'chai',
    'p-map',
    'remote-git-tags',
    'untildify',
  ],
}
