module.exports = {
  env: {
    es6: true,
    mocha: true,
    node: true,
  },
  extends: [
    'standard',
    'eslint:recommended',
    'plugin:import/typescript',
    'raine'
  ],
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended'
      ],
      globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
      },
      plugins: ['@typescript-eslint'],
      rules: {
        'import/prefer-default-export': 0,
        // temporary fix from 'typescript-eslint' docs
        // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-unused-vars.md
        'no-extra-parens': 0,
        'no-unused-vars': 0,
        'no-use-before-define': 0,
        '@typescript-eslint/member-delimiter-style': [2,
          {
            multiline: {
              delimiter: 'comma'
            },
            singleline: {
              delimiter: 'comma'
            }
          }
        ],
        '@typescript-eslint/no-explicit-any': 0,
        '@typescript-eslint/no-extra-parens': [2,
          'all',
          {
            nestedBinaryExpressions: false
          }
        ],
        '@typescript-eslint/no-non-null-assertion': 0,
        '@typescript-eslint/no-use-before-define': 2,
        '@typescript-eslint/no-unused-vars': 2,
        '@typescript-eslint/explicit-function-return-type': 0,
        '@typescript-eslint/explicit-module-boundary-types': 0,
        '@typescript-eslint/array-type': [2,
          {
            'array-type': 'array'
          }
        ],
      },
    }
  ],
  // to be removed later
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly'
  },
  plugins: [
    'fp',
    'jsdoc',
  ],
  rules: {

    // jsdoc
    'jsdoc/require-jsdoc': [2,
      {
        contexts: [
          'VariableDeclarator > ArrowFunctionExpression'
        ],
        require: {
          ClassDeclaration: true,
          ClassExpression: true
        }
      }
    ],

  }
}
