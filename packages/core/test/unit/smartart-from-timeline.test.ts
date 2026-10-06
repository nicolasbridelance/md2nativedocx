import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeline } from '../../src/diagrams/timeline/parser.js';
import { generateTimelineSmartArt, timelineFitsSmartArt } from '../../src/smartart/from-timeline.js';
import { periodText, timelineLayoutXml } from '../../src/smartart/timeline.js';

const TIMELINE = ['timeline', '  title Réseaux', '  2002 : LinkedIn', '  2004 : Facebook', '       : Google', '  2006 : Twitter'].join('\n');

test('period text: bold period line(s), then one line per event', () => {
  assert.deepEqual(periodText('2004', ['Facebook', 'Google']), [
    { text: '2004', bold: true },
    { break: true },
    { text: 'Facebook' },
    { break: true },
    { text: 'Google' },
  ]);
});

test('timeline SmartArt: one content point per period under the doc, dot + box per period, axis, own layout id', () => {
  const out = generateTimelineSmartArt(parseTimeline(TIMELINE).ast, { drawing: true });
  assert.equal(out?.layout, 'timeline');
  const data = out?.dataXml ?? '';
  assert.equal((data.match(/type="parOf"/g) ?? []).length, 3);
  assert.equal((data.match(/presName="dot"/g) ?? []).length, 3);
  assert.equal((data.match(/presName="text"/g) ?? []).length, 3);
  assert.equal((data.match(/presName="axis"/g) ?? []).length, 1);
  assert.ok(data.includes('loTypeId="urn:md2nativedocx/smartart-layout/timeline1-n3"'));
  assert.ok(out?.layoutXml.includes('uniqueId="urn:md2nativedocx/smartart-layout/timeline1-n3"'));
  assert.ok(data.includes('<a:rPr lang="fr-FR" b="1"/><a:t>2004</a:t>'));
  assert.ok(!data.includes('Réseaux'), 'the title is not part of the SmartArt');
  assert.ok(!data.includes('TargetMode'), 'no external relationship');
  // Cached drawing: one arrow (axis), three dots, three boxes; boxes alternate above/below.
  const drawing = out?.drawingXml ?? '';
  assert.equal((drawing.match(/prst="rightArrow"/g) ?? []).length, 1);
  assert.equal((drawing.match(/prst="ellipse"/g) ?? []).length, 3);
  const boxYs = [...drawing.matchAll(/<a:off x="\d+" y="(\d+)"\/><a:ext cx="\d+" cy="\d+"\/><\/a:xfrm><a:prstGeom prst="roundRect"/g)].map((m) => Number(m[1]));
  assert.equal(boxYs.length, 3);
  assert.equal(boxYs[0], 0);
  assert.ok((boxYs[1] ?? 0) > 0);
  assert.equal(boxYs[2], 0);
  assert.ok(out?.frame && out.frame.cy > 0);
});

test('the layout alternates sides on the period position and lets boxes overhang only from three periods', () => {
  const three = timelineLayoutXml(3);
  assert.ok(three.includes('func="posOdd"'));
  assert.ok(three.includes('forName="text" refType="w" fact="1.8"'));
  assert.ok(timelineLayoutXml(2).includes('forName="text" refType="w" fact="1"'));
});

test('sections, a single period, or words that cannot stay whole keep the shape-built timeline', () => {
  const sections = parseTimeline('timeline\n  section A\n    2002 : x\n  section B\n    2003 : y').ast;
  assert.equal(timelineFitsSmartArt(sections), false);
  assert.equal(generateTimelineSmartArt(sections), null);
  assert.equal(generateTimelineSmartArt(parseTimeline('timeline\n  2002 : x').ast), null);
  const crowded = ['timeline', ...Array.from({ length: 12 }, (_, i) => `  P${i} : Anticonstitutionnellement`)].join('\n');
  assert.equal(timelineFitsSmartArt(parseTimeline(crowded).ast), false);
  assert.equal(timelineFitsSmartArt(parseTimeline(TIMELINE).ast), true);
});

test('timeline text is XML-escaped in every SmartArt part', () => {
  const out = generateTimelineSmartArt(parseTimeline('timeline\n  <b> & "x" : <script>\n  2003 : \'y\'').ast, { drawing: true });
  assert.ok(out);
  for (const part of [out.dataXml, out.drawingXml ?? '']) {
    assert.ok(!part.includes('<script>'));
    assert.ok(!part.includes('<b>'));
    assert.ok(part.includes('&lt;script&gt;'));
    assert.ok(part.includes('&amp;'));
  }
});
