import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { XMLValidator } from 'fast-xml-parser';
import { layout, parseMermaid, translateToOoxml } from '@md2nativedocx/core';
import { buildPptx } from '../src/build-pptx.js';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../src/package-parts.js';

function fragment(source: string): string {
  const { ast } = parseMermaid(source);
  return translateToOoxml(ast, layout(ast));
}

const NOW = new Date('2026-10-02T00:00:00Z');

test('assembles a self-contained package: every part is well-formed, no external relationship', () => {
  const { buffer } = buildPptx(
    [{ fragmentXml: fragment('flowchart LR\n A --> B'), title: 'Flow <&>' }, { fragmentXml: fragment('flowchart TD\n C --> D') }],
    { now: NOW },
  );
  const zip = new AdmZip(buffer);
  const names = zip.getEntries().map((e) => e.entryName);
  assert.ok(names.includes('[Content_Types].xml'));
  for (const part of ['ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/theme/theme1.xml']) {
    assert.ok(names.includes(part), `missing ${part}`);
  }
  for (const entry of zip.getEntries()) {
    const text = entry.getData().toString('utf8');
    assert.equal(XMLValidator.validate(text), true, `${entry.entryName} is not well-formed`);
    assert.doesNotMatch(text, /TargetMode/);
  }
});

test('puts the escaped title on the slide and keeps every shape inside the slide', () => {
  const { buffer, warnings } = buildPptx([{ fragmentXml: fragment('flowchart LR\n A --> B --> C'), title: 'T <&> "q"' }], {
    now: NOW,
  });
  const slide = new AdmZip(buffer).readAsText('ppt/slides/slide1.xml');
  assert.match(slide, /T &lt;&amp;&gt; &quot;q&quot;/);
  for (const m of slide.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"/g)) {
    const [x, y, cx, cy] = m.slice(1).map(Number) as [number, number, number, number];
    assert.ok(x >= 0 && y >= 0 && x + cx <= SLIDE_WIDTH && y + cy <= SLIDE_HEIGHT, `shape out of slide: ${m[0]}`);
  }
  assert.deepEqual(warnings, []);
});

test('slide shape ids are unique', () => {
  const { buffer } = buildPptx([{ fragmentXml: fragment('flowchart LR\n A --> B\n B --> C\n A --> C'), title: 'T' }], { now: NOW });
  const slide = new AdmZip(buffer).readAsText('ppt/slides/slide1.xml');
  const ids = [...slide.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('output is reproducible for a fixed timestamp', () => {
  const input = [{ fragmentXml: fragment('flowchart LR\n A --> B') }];
  const a = new AdmZip(buildPptx(input, { now: NOW }).buffer).readAsText('ppt/slides/slide1.xml');
  const b = new AdmZip(buildPptx(input, { now: NOW }).buffer).readAsText('ppt/slides/slide1.xml');
  assert.equal(a, b);
});
