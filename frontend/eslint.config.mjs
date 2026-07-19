import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Pre-existing codebase: many hooks already have deps that aren't
      // exhaustive by design (e.g. intentionally-omitted stable setters).
      // Keep this as a warning so lint gives useful signal without
      // failing the build on long-standing, working code.
      'react-hooks/exhaustive-deps': 'warn',
      // Same rationale — surfaces real dead code without hard-failing on
      // existing unused destructured values / catch bindings, etc.
      '@typescript-eslint/no-unused-vars': 'warn',
      // `any` is used pervasively across ~20 existing page components for
      // untyped API responses/form payloads (100+ occurrences). Fixing that
      // properly is a real typing effort, not an ESLint-config task, so this
      // is downgraded to a warning rather than left as an error that would
      // fail every lint run out of the box. New code should still avoid
      // `any` — this rule keeps flagging it, just non-fatally.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
