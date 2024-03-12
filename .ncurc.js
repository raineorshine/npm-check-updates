module.exports = {
  format: 'group',
  reject: [
    // TODO: major version upgrades
    'chai',
    'commander',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    // ESM only modules
    // https://github.com/microsoft/TypeScript/issues/46452
    'find-up',
    /* pin to 4.0.0 to match make-fetch-happen/cacache. */
    'p-map',
    'remote-git-tags',
    'untildify',
    // major changes required to upgrade to v3
    'spawn-please',
    // v0.60.0 breaks cli option description output
    // https://github.com/YousefED/typescript-json-schema/issues/568
    'typescript-json-schema',
    // node >= 18
    'update-notifier',
  ],
}
