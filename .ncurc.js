module.exports = {
  format: 'group',
  reject: [
    // breaking
    'eslint',
    'eslint-plugin-n',
    'eslint-plugin-promise',
    // esm only modules
    '@types/chai',
    '@types/chai-as-promised',
    '@types/remote-git-tags',
    'camelcase',
    'chai-as-promised',
    'find-up',
    'chai',
    'p-map',
    'remote-git-tags',
    'untildify',
  ],
}
