/**
 * Shared helpers for `LabelToken[]` (`types.ts`) — the rich-text structure
 * behind a node/edge label's runs (bold/italic spans + `<br/>` line breaks).
 * Parsing raw Mermaid text into tokens is `parser.ts`'s job (it owns entity
 * decoding and the Markdown-string convention); this module only groups an
 * already-parsed token list, for callers (`layout.ts`) that need per-line
 * plain text for width/height estimation and don't care about bold/italic.
 */

import type { LabelToken } from './types.js';

/**
 * Split a label's tokens into one flattened plain-text string per forced
 * line break. A label with no `<br/>` at all returns a single-element array
 * (the previous, pre-rich-text behavior — `layout.ts`'s wrap estimator sees
 * no change for the common case).
 */
export function labelLines(tokens: LabelToken[]): string[] {
  const lines: string[] = [];
  let current = '';
  for (const token of tokens) {
    if ('break' in token) {
      lines.push(current);
      current = '';
    } else {
      current += token.text;
    }
  }
  lines.push(current);
  return lines;
}
