// Flat config (ESLint 9+). Migrated from .eslintrc.cjs with the same rule set; no rule
// was added, removed or relaxed in the move.
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';

export default [
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/.vscode-test/', // downloaded VS Code test host (gitignored), ships its own eslint config
      '**/*.js',
      // Same scope as the former .eslintrc.cjs, which only ever linted TypeScript: the
      // standalone .mjs/.cjs scripts and bin entry points were never part of `npm run lint`.
      '**/*.mjs',
      '**/*.cjs',
      // Vendored MIT source kept only as a read-only reference for the Gantt
      // parser spike (decision: reuse rejected at runtime — see
      // docs/adr/spikes/spike-gantt-parser/spike.md) — not code this project
      // maintains or ships, so it shouldn't be held to this repo's lint rules.
      'docs/adr/spikes/spike-gantt-parser/reference/',
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  security.configs.recommended,
  {
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
      // Both rules below are triaged off after reviewing every flagged site (see PR history):
      // every dynamic property access is keyed by an internal id/enum (layout node ids, shape/edge
      // type lookups, the XML_ESCAPES table) with a bounded/guarded key, never by untrusted input
      // reaching an object as a key; and every non-literal RegExp is built from constants escaped
      // via escapeRegex() or from already-length-bounded captures (fence markers). The actual
      // security control for untrusted Mermaid text is escapeXml() (packages/core/src/translator/
      // xml-escape.ts) plus the fuzz suite (packages/core/test/fuzz), not this heuristic.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
  {
    // Test-only XML tokenizer regex, run only against this suite's own generated fixtures
    // (never untrusted input), duplicated across several golden/unit test files.
    files: ['**/test/**/*.ts'],
    rules: { 'security/detect-unsafe-regex': 'off' },
  },
];
