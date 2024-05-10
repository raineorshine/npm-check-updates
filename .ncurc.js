module.exports = {
  format: 'group',
  reject: [
    // esm only modules
    'camelcase',
    'find-up',
    'chai',
    'p-map',
    'remote-git-tags',
    'untildify',
    // major changes required to upgrade to v3
    'spawn-please',
  ],
}
