module.exports = {
  format: 'group',
  reject: [
    // ESM only modules
    // https://github.com/microsoft/TypeScript/issues/46452
    'find-up',
    'get-stdin',
    'globby',
    'p-map',
    'remote-git-tags',
    'untildify',
    // Broken in v6.0.0
    // Working upgrade is in branch 'hosted-git-info', but hold off on merging due to node engine requirements: ^14.17.0 || ^16.13.0 || >=18.0.0
    // https://github.com/npm/hosted-git-info/releases/tag/v6.0.0
    'hosted-git-info',
    // Waiting for Prettier v3 support in @trivago/prettier-plugin-sort-imports
    // https://github.com/trivago/prettier-plugin-sort-imports/issues/240
    'prettier',
    // Removed support for node v14 in v0.35.0
    'makdownlint-cli',
    // manually keep in alignment with pacote's version of make-fetch-happen
    'make-fetch-happen',
    // 5.2.0 breaks moduleResolution
    // Need to upgrade module and moduleResolution together (high risk)
    'typescript',
    // v0.60.0 breaks cli option description output
    // https://github.com/YousefED/typescript-json-schema/issues/568
    'typescript-json-schema',
  ],
}
