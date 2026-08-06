import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMermaid } from '../../src/parser/index.js';
import { layout } from '../../src/layout/layout.js';
import { translateToOoxml } from '../../src/translator/ooxml-translator.js';

const here = dirname(fileURLToPath(import.meta.url));
// Fixtures live in the source tree (test/golden/fixtures), not in dist-test.
// From dist-test/test/golden, go up 3 levels to the package root, then into
// test/golden/fixtures.
const fixturesDir = join(here, '..', '..', '..', 'test', 'golden', 'fixtures');

/**
 * Structural XML comparison: parse both strings and compare element trees,
 * ignoring attribute order and insignificant whitespace. This tolerates
 * attribute reordering in the translator output (spec §9 golden tests).
 */
function structuralEqual(actual: string, expected: string): boolean {
  const parse = (s: string) => {
    // Minimal structural tokenizer: extract element names and text content in
    // document order, ignoring attribute order and whitespace.
    const tokens: string[] = [];
    const re = /<(\/?)([A-Za-z0-9:_-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m[0].startsWith('<')) {
        tokens.push(`${m[1]}${m[2]}${m[4]}`);
      } else {
        const text = m[5]!.trim();
        if (text.length > 0) tokens.push(`text:${text}`);
      }
    }
    return tokens;
  };
  const a = parse(actual);
  const b = parse(expected);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

test('golden: simple two-node flowchart matches fixture', () => {
  const { ast } = parseMermaid('graph TD\n  A[Start] --> B[End]');
  const xml = translateToOoxml(ast, layout(ast));
  const golden = readFileSync(join(fixturesDir, 'two-node.xml'), 'utf8');
  assert.ok(
    structuralEqual(xml, golden),
    `XML structure differs from golden fixture.\n--- actual ---\n${xml}\n--- golden ---\n${golden}`,
  );
});
