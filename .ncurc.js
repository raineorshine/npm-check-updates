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
    // Broken in v6.0.0
    // Working upgrade is in branch 'hosted-git-info', but hold off on merging due to node engine requirements: ^14.17.0 || ^16.13.0 || >=18.0.0
    // https://github.com/npm/hosted-git-info/releases/tag/v6.0.0
    'hosted-git-info',
    // major changes required to upgrade to v3
    'spawn-please',
    // v0.60.0 breaks cli option description output
    // https://github.com/YousefED/typescript-json-schema/issues/568
    'typescript-json-schema',
    // node >= 18
    'update-notifier',
  ],
}
