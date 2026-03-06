import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  {
    ...reactHooks.configs.flat.recommended,
    files: ['**/src/**/*.ts*'],
    languageOptions: { parser: tsParser },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/out/**',
      '**/build/**',
      '**/tmp/**',
      '**/coverage/**',
      '**/coverage-*/**',
      '**/convex',
      '**/solid',
    ],
  },
]);
