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
        '@typescript-eslint/no-explicit-any': 0,
        '@typescript-eslint/no-non-null-assertion': 0,
        '@typescript-eslint/no-use-before-define': 2,
        '@typescript-eslint/no-unused-vars': 2,
        '@typescript-eslint/array-type': [
          2,
          {
            'array-type': 'array',
          },
        ],
      },
    },
  ],
  // to be removed later
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  plugins: ['fp', 'jsdoc'],
  rules: {
    // jsdoc
    'jsdoc/require-jsdoc': [
      2,
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
