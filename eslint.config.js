import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // supabase/functions runs on Deno (checked with `deno check`).
    ignores: ['**/dist/**', '**/dev-dist/**', '**/node_modules/**', 'coverage/**', 'supabase/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The simulation must stay deterministic: randomness and time are injected.
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the injected seeded Rng.' },
        { object: 'Date', property: 'now', message: 'Use the injected clock / `now` argument.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance'],
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', 'preact', 'preact/*'] }],
    },
  },
);
