const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/build/**',
      '**/ios/**',
      '**/android/**',
      'packages/types/src/database.types.ts',
      'supabase/functions/**', // Deno runtime, linted separately by `deno lint`
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, import: importPlugin },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // AGENTS.md rule: Expo Router route files compose screens, they do not hold logic.
  {
    files: ['apps/mobile/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', '**/lib/supabase/*'],
              message:
                'Route files must not talk to Supabase directly. Call a feature hook from src/features/*.',
            },
          ],
        },
      ],
    },
  },

  // Web architectural boundaries: Web UI isolated from mobile, no @cal/ui, no native packages.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cal/ui', 'react-native*', 'expo*', '**/apps/mobile/**'],
              message:
                'apps/web must remain isolated from mobile UI. Do not import @cal/ui, React Native, Expo, or mobile code.',
            },
          ],
        },
      ],
    },
  },

  // Web routes and pages must not talk to Supabase directly; call a feature hook/API.
  {
    files: ['apps/web/src/pages/**/*.{ts,tsx}', 'apps/web/src/routes.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', '**/lib/supabase/*'],
              message:
                'Web route/page components must not talk to Supabase directly. Call a feature hook/API from src/features/*.',
            },
          ],
        },
      ],
    },
  },

  // Domain packages stay pure: no React, no network, no platform APIs.
  {
    files: ['packages/domain/**/*.ts', 'packages/schemas/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-native', 'expo*', '@supabase/*'],
              message:
                'packages/domain and packages/schemas must stay pure TypeScript with no platform dependencies.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
