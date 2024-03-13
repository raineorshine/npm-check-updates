module.exports = {
  format: 'group',
  reject: [
    // esm only modules
    'find-up',
    'chai',
    'p-map',
    'remote-git-tags',
    'untildify',
    // major changes required to upgrade to v3
    'spawn-please',
    // v0.60.0 breaks cli option description output
    // https://github.com/YousefED/typescript-json-schema/issues/568
    'typescript-json-schema',
    // node >= 18
    'commander', // https://github.com/tj/commander.js/blob/master/CHANGELOG.md
    'update-notifier',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
  ],
}
