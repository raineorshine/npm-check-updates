module.exports = {
  format: 'group',
  reject: [
    // breaking
    '@types/bun',
    '@types/chai-as-promised',
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
