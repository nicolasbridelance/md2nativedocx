/**
 * Mermaid conformance, stage 1 (TODO §2): every official example of the Mermaid syntax pages
 * (`test-corpus/mermaid-official/examples.json`, fetched by `scripts/fetch-mermaid-examples.mjs`) is
 * rendered here. Locked: no example throws, no example is drawn as another type, and every example in
 * `expected-clean.json` still renders without a syntax warning. After a fix, raise the baseline with
 * `node scripts/mermaid-conformance.mjs --write-baseline --report`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDiagram } from '../../src/index.js';

const corpus = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'test-corpus', 'mermaid-official');
const data = JSON.parse(readFileSync(join(corpus, 'examples.json'), 'utf8')) as { tag: string; pages: Record<string, string[]> };
const baseline = new Set((JSON.parse(readFileSync(join(corpus, 'expected-clean.json'), 'utf8')) as { clean: string[] }).clean);

/** Rendering notices, not syntax gaps (same list as scripts/mermaid-conformance.mjs). */
const NOTICES = [/^Actor icons and /, /^diagram scaled down to fit the page/, /^Frontmatter options \(theme, colours, layout\) are not applied/, /^Interactive directives \(`click`, `link`, `callback`\) are not exported/];

test(`Mermaid official examples (${data.tag}): none throws, none is drawn as a flowchart by mistake, the clean ones stay clean`, () => {
  const regressions: string[] = [];
  for (const [page, examples] of Object.entries(data.pages)) {
    examples.forEach((source, i) => {
      const id = `${page}#${i}`;
      const result = renderDiagram(source, { smartArt: true, nativeCharts: true, newPartId: () => '00000000-0000-4000-8000-000000000000' });
      assert.notEqual(result.metadata.diagramType, 'unknown', id);
      const gaps = result.metadata.warnings.filter((w) => !NOTICES.some((re) => re.test(w)));
      if (baseline.has(id) && gaps.length > 0) regressions.push(`${id}: ${gaps.join(' | ')}`);
    });
  }
  assert.deepEqual(regressions, [], 'examples that used to render cleanly now warn');
});
