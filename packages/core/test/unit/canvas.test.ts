import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaledExtent } from '../../src/translator/canvas.js';
import { parsePieChart } from '../../src/diagrams/pie/parser.js';
import { translatePieToOoxml } from '../../src/diagrams/pie/translator.js';
import { parseSequence } from '../../src/diagrams/sequence/parser.js';
import { translateSequenceToOoxml } from '../../src/diagrams/sequence/translator.js';

const extentCx = (xml: string): number => Number(/<wp:extent cx="(\d+)"/.exec(xml)?.[1]);

test('scaledExtent honors maxDrawingCx/maxDrawingCy and keeps the default cap without them', () => {
  const big = scaledExtent(2000, 2000);
  const capped = scaledExtent(2000, 2000, { maxDrawingCx: 1_000_000, maxDrawingCy: 1_000_000 });
  assert.ok(capped.cx <= 1_000_000 && capped.cy <= 1_000_000);
  assert.ok(capped.scale < big.scale);
});

test('a non-flowchart translator scales its drawing down to a caller-supplied maxDrawingCx', () => {
  const pie = parsePieChart('pie showData\n  title Pets\n  "Dogs" : 386\n  "Cats" : 85\n  "Rats" : 15').ast;
  const seq = parseSequence('sequenceDiagram\n  participant Alice\n  participant Bob\n  participant Carol\n  Alice->>Bob: Hello Bob, how are you today?\n  Bob->>Carol: Forward the greeting please').ast;
  for (const [free, capped] of [
    [translatePieToOoxml(pie), translatePieToOoxml(pie, { maxDrawingCx: 1_500_000 })],
    [translateSequenceToOoxml(seq), translateSequenceToOoxml(seq, { maxDrawingCx: 1_500_000 })],
  ] as const) {
    assert.ok(extentCx(capped) <= 1_500_000, `capped extent ${extentCx(capped)}`);
    assert.ok(extentCx(free) > extentCx(capped));
  }
});
