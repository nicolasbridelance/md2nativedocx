#!/usr/bin/env node
/**
 * MVP acceptance evidence (cahier des charges §9): "sur un flowchart de 15
 * nœuds ou moins, 0 croisement de flèches nécessitant un réarrangement
 * manuel dans >90 % des cas testés."
 *
 * This has so far only been checked by eye during visual-baseline review
 * (TODO.md). This script makes it objective: it re-runs the real
 * parser+layout pipeline on every fixture, geometrically counts edge/edge
 * crossings on the polylines Dagre actually routed (the same points
 * `ooxml-translator.ts` draws), and reports a pass rate — no rendering, no
 * eyeballing.
 *
 * A crossing is only counted between two edges that do NOT share an
 * endpoint node: two edges meeting at a shared node legitimately touch at
 * that node's boundary, which is not the "arrow crossing" the spec means.
 *
 * Usage: node scripts/mvp-crossing-report.mjs (after `npm run build -w packages/core`)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMermaid } from '../packages/core/dist/index.js';
import { layout } from '../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const fixturesDir = join(repoRoot, 'test-corpus', 'visual', 'fixtures');

/** Segment-segment intersection, excluding shared-endpoint touches. */
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = d(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
  const d2 = d(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
  const d3 = d(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  const d4 = d(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function polylineSegments(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push([points[i], points[i + 1]]);
  return segs;
}

function countCrossings(flowchart, layoutResult) {
  const edges = flowchart.edges;
  let crossings = 0;
  const details = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      // Edges sharing an endpoint node touch there legitimately — not a crossing.
      const shareNode = a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
      if (shareNode) continue;
      const segsA = polylineSegments(layoutResult.edges[i]);
      const segsB = polylineSegments(layoutResult.edges[j]);
      for (const [a1, a2] of segsA) {
        for (const [b1, b2] of segsB) {
          if (segmentsIntersect(a1, a2, b1, b2)) {
            crossings++;
            details.push(`${a.from}->${a.to} x ${b.from}->${b.to}`);
          }
        }
      }
    }
  }
  return { crossings, details };
}

const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.mmd'));
const results = [];

for (const file of files) {
  const source = readFileSync(join(fixturesDir, file), 'utf8');
  let ast;
  try {
    ({ ast } = parseMermaid(source));
  } catch (e) {
    results.push({ file, skipped: `parse error: ${e.message}` });
    continue;
  }
  const nodeCount = ast.nodes.length;
  if (nodeCount === 0 || nodeCount > 15) {
    results.push({ file, skipped: `${nodeCount} nodes (out of ≤15 scope)` });
    continue;
  }
  const layoutResult = layout(ast);
  const { crossings, details } = countCrossings(ast, layoutResult);
  results.push({ file, nodeCount, edgeCount: ast.edges.length, crossings, details });
}

const tested = results.filter((r) => !r.skipped);
const passing = tested.filter((r) => r.crossings === 0);
const rate = tested.length ? (passing.length / tested.length) * 100 : 0;

console.log('# MVP crossing-acceptance report\n');
console.log(`Fixtures scanned: ${files.length}`);
console.log(`In scope (≤15 nodes, parseable): ${tested.length}`);
console.log(`Out of scope / skipped: ${results.length - tested.length}\n`);

for (const r of results) {
  if (r.skipped) {
    console.log(`  - ${r.file}: SKIPPED (${r.skipped})`);
  } else {
    const mark = r.crossings === 0 ? 'PASS' : `FAIL (${r.crossings} crossing${r.crossings > 1 ? 's' : ''}: ${r.details.join(', ')})`;
    console.log(`  - ${r.file}: ${r.nodeCount} nodes, ${r.edgeCount} edges — ${mark}`);
  }
}

console.log(`\nPass rate: ${passing.length}/${tested.length} = ${rate.toFixed(1)}%`);
console.log(`Spec threshold: >90%`);
console.log(rate > 90 ? 'RESULT: MEETS the MVP acceptance criterion on this corpus.' : 'RESULT: DOES NOT meet the MVP acceptance criterion on this corpus.');
