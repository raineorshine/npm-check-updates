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
import globals from 'globals'

export default [
  // --- 1. GLOBAL IGNORES ---
  {
    ignores: ['**/node_modules/', 'dist/', 'build/', 'temp/', '.cache/', '**/node_modules/**/*.md'],
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
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.mocha,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
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

  // --- 5. JSDOC SPECIFIC OVERRIDES ---
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

  // --- 6. TYPESCRIPT OVERRIDES ---
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
        ...globals.es2021,
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
    },
  },

  // --- 7. PRETTIER ---
  prettierConfig,
]
