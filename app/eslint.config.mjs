// ESLint covers the plain JavaScript build scripts. TypeScript (main, preload,
// renderer, tests) is checked by `tsc` in strict mode (`npm run typecheck`):
// linting TypeScript would need the typescript-eslint parser, which is not a
// pre-approved dependency.

export default [
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-implicit-globals': 'error',
      'no-shadow': 'error',
      curly: ['error', 'multi-line'],
    },
  },
]
