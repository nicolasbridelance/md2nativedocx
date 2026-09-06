module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended-legacy',
  ],
  env: {
    node: true,
    es2022: true,
  },
  // packages/word-addin has its own lint pipeline (office-addin-lint, its own .eslintrc.json
  // scoped with root:true) built for browser/Office.js code on a newer eslint-plugin-office-addins
  // that isn't compatible with this root config's ESLint 8 runtime — mixing the two here crashes
  // `eslint .` outright (TypeError: Converting circular structure to JSON while validating the
  // nested config), not just producing noisy findings. Run `npm run lint -w packages/word-addin`
  // for that package instead.
  ignorePatterns: ['dist/', 'node_modules/', '*.js', 'packages/word-addin/'],
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
  overrides: [
    {
      // Test-only XML tokenizer regex, run only against this suite's own generated fixtures
      // (never untrusted input), duplicated across several golden/unit test files.
      files: ['**/test/**/*.ts'],
      rules: {
        'security/detect-unsafe-regex': 'off',
      },
    },
  ],
};
