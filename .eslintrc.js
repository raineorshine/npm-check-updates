module.exports = {
  env: {
    es6: true,
    mocha: true,
    node: true,
  },
  extends: ['standard', 'eslint:recommended', 'plugin:import/typescript', 'raine', 'prettier'],
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      extends: ['plugin:@typescript-eslint/eslint-recommended', 'plugin:@typescript-eslint/recommended'],
      globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
      },
      plugins: ['@typescript-eslint'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-use-before-define': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/array-type': [
          'error',
          {
            default: 'array',
          },
        ],
      },
    },
  ],
  plugins: ['jsdoc'],
  rules: {
    'jsdoc/require-jsdoc': [
      'error',
      {
        contexts: ['VariableDeclarator > ArrowFunctionExpression'],
        require: {
          ClassDeclaration: true,
          ClassExpression: true,
        },
      },
    ],
  },
}
