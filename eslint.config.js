import { fixupConfigRules, fixupPluginRules } from '@eslint/compat'
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'
import raineConfig from 'eslint-config-raine'
import standardConfig from 'eslint-config-standard'
import importXPlugin from 'eslint-plugin-import-x'
import jsdocPlugin from 'eslint-plugin-jsdoc'
// The modern replacement
import nPlugin from 'eslint-plugin-n'
import promisePlugin from 'eslint-plugin-promise'
import unicornPlugin from 'eslint-plugin-unicorn'
import globals from 'globals'

export default [
  // --- 1. GLOBAL IGNORES ---
  {
    ignores: [
      '**/node_modules/',
      'dist/',
      'build/',
      'temp/',
      '.cache/',
      '**/node_modules/**/*.md',
      // vendored third-party code
      'src/lib/libnpmconfig/',
      'src/lib/figgy-pudding/',
      // CommonJS test fixtures
      'test/e2e/cjs/',
      'test/test-data/deep-ncurc/',
    ],
  },

  // --- 2. PLUGIN DEFINITIONS ---
  {
    plugins: {
      // import-x works natively with ESLint 10
      'import-x': importXPlugin,
      n: fixupPluginRules(nPlugin),
      promise: fixupPluginRules(promisePlugin),
      jsdoc: jsdocPlugin,
    },
  },

  // --- 3. GLOBAL SETUP & SETTINGS ---
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
        ...raineConfig.globals,
      },
    },
    settings: {
      // Modern replacement for 'plugin:import/typescript'
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: true,
      },
    },
  },

  // --- 4. BASE RULES (Standard + Raine) ---
  ...fixupConfigRules([
    {
      rules: {
        ...js.configs.recommended.rules,
        ...standardConfig.rules,
        ...raineConfig.rules,
      },
    },
  ]).map(config => {
    // We must remap 'import/' rules to 'import-x/' for the new plugin
    if (config.rules) {
      const newRules = {}
      for (const [key, value] of Object.entries(config.rules)) {
        const newKey = key.startsWith('import/') ? key.replace('import/', 'import-x/') : key
        newRules[newKey] = value
      }
      config.rules = newRules
    }
    return config
  }),

  // --- UNICORN (unopinionated) ---
  unicornPlugin.configs.unopinionated,
  {
    rules: {
      // too opinionated for this codebase
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prefer-type-error': 'off',
      'unicorn/prevent-abbreviations': 'off',
      // all .sort() usages are on string arrays where the default order is intended
      'unicorn/require-array-sort-compare': 'off',
      'unicorn/text-encoding-identifier-case': 'off',
      // not on by default in unopinionated, but we want it enforced
      'unicorn/prefer-includes-over-repeated-comparisons': 'error',
    },
  },

  // --- 5. IMPORT HYGIENE ---
  {
    rules: {
      'n/prefer-node-protocol': 'error',
      'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
      'import-x/extensions': ['error', 'always', { ignorePackages: true, checkTypeImports: true }],
      // Node's native loader requires an import attribute on JSON imports
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value=/\\.json$/]:not(:has(ImportAttribute))',
          message: "JSON imports require an import attribute: with { type: 'json' }",
        },
        // Enforce inline type imports (import { type X }) over the prefix form (import type { X }),
        // matching consistent-type-imports' inline fixStyle. The rule above accepts both forms.
        // Only named imports have an inline form, so default/namespace type imports are left alone.
        {
          selector:
            "ImportDeclaration[importKind='type']:has(ImportSpecifier):not(:has(ImportDefaultSpecifier)):not(:has(ImportNamespaceSpecifier))",
          message: 'Use an inline type import: import { type X } instead of import type { X }.',
        },
        // Enforce prefix type exports (export type { X }) over the inline form (export { type X }),
        // the inverse of the import convention. consistent-type-exports accepts both forms.
        {
          selector: "ExportSpecifier[exportKind='type']",
          message: 'Use a prefix type export: export type { X } instead of export { type X }.',
        },
      ],
    },
  },

  // --- 6. JSDOC SPECIFIC OVERRIDES ---
  {
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: ['VariableDeclarator > ArrowFunctionExpression'],
          require: { ClassDeclaration: true, ClassExpression: true },
        },
      ],
    },
  },

  // --- 7. TYPESCRIPT OVERRIDES ---
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        warnOnUnsupportedTypeScriptVersion: false,
      },
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',

      ...tsPlugin.configs['eslint-recommended'].rules,
      ...tsPlugin.configs.recommended.rules,

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-exports': [
        'error',
        {
          // prefer separate `export type { X }` statements, not inline specifiers
          fixMixedExportsWithInlineTypeSpecifier: false,
        },
      ],

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          caughtErrors: 'none',
          destructuredArrayIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  // --- 8. PRETTIER ---
  prettierConfig,
]
