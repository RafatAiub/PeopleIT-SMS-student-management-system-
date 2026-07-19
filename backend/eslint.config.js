// ESLint flat config (ESLint 9+) for the backend workspace.
//
// Scope: `npm run lint` runs `eslint src --ext .ts`, so only backend/src is
// linted today. tests/ is intentionally left out of the lint script (it's a
// separate concern covered by `npm test`); this config still recognizes
// tests/**/*.ts with Jest globals in case lint is ever pointed at it (e.g.
// `npx eslint tests`), but does not change the existing npm script scope.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

module.exports = tseslint.config(
  {
    // Applies to the whole flat config (global ignores).
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'generated/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Main application source.
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Express's own types are declared as a `namespace Express { ... }`,
      // so augmenting `Request` (see auth.middleware.ts) requires merging
      // into that same namespace inside `declare global { ... }`. That's
      // the standard, idiomatic pattern for this — not something to
      // refactor away — so allow declared namespaces while still catching
      // ad-hoc `namespace Foo {}` usage elsewhere.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],

      // This is an existing Express/Prisma codebase, not greenfield — `any`
      // shows up in a handful of legitimate spots (req/res augmentation,
      // Prisma JSON columns, third-party payloads). Flag it for visibility
      // without failing the build over pre-existing, intentional usage.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Several modules (e.g. user.service.ts) use function-scoped
      // `require('../../config/prisma')` deliberately, to defer module
      // resolution. Downgrading rather than forcing a refactor of working
      // code that isn't part of this task.
      '@typescript-eslint/no-require-imports': 'warn',

      // Express handlers conventionally keep unused `req`/`res`/`next`
      // parameters for signature/middleware-shape reasons, and the codebase
      // already prefixes intentionally-unused ones with `_` (see
      // error.middleware.ts). Recognize that convention instead of forcing
      // every handler to satisfy the rule some other way.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    // Jest test files — not currently in the `lint` script's scope
    // (`eslint src --ext .ts`), but configured here so `npx eslint tests`
    // works sensibly if it's ever run directly.
    files: ['tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
);
