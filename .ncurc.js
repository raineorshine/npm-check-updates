module.exports = {
  format: 'group',
  reject: [
    // breaking
    'chai-as-promised',
    'eslint',
    'eslint-plugin-n',
    'eslint-plugin-promise',
    // esm only modules
    'camelcase',
    'find-up',
    'chai',
    'p-map',
    'remote-git-tags',
    'untildify',
  ],
}
