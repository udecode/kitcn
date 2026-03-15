'use strict';
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    'convex/_generated',
    'postcss.config.js',
    'tailwind.config.js',
    'vite.config.ts',
    // shadcn components by default violate some rules
    'src/components/ui',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    EXPERIMENTAL_useProjectService: true,
  },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],

    // All of these overrides ease getting into
    // TypeScript, and can be removed for stricter
    // linting down the line.

    // Only warn on unused variables, and ignore variables starting with `_`
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],

    // Allow escaping the compiler
    '@typescript-eslint/ban-ts-comment': 'error',

    // Allow explicit `any`s
    '@typescript-eslint/no-explicit-any': 'off',

    // START: Allow implicit `any`s
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    // END: Allow implicit `any`s

    // Allow async functions without await
    // for consistency (esp. Convex `handler`s)
    '@typescript-eslint/require-await': 'off',
  },
};
