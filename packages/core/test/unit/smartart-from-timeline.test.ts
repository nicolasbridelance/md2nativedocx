import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeline } from '../../src/diagrams/timeline/parser.js';
import { periodText, timelineLayoutXml } from '../../src/smartart/timeline.js';
import { parseJourney } from '../../src/diagrams/journey/parser.js';
import {
  generateJourneySmartArt,
  generateTimelineSmartArt,
  journeyFitsSmartArt,
  journeyTaskText,
  timelineFitsSmartArt,
} from '../../src/smartart/from-timeline.js';
import { groupedTimelineLayoutXml, sectionWeights } from '../../src/smartart/timeline-grouped.js';

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

test('a single period, or words that cannot stay whole, keep the shape-built timeline', () => {
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


const JOURNEY = [
  'journey',
  '  title My working day',
  '  section Go to work',
  '    Make tea: 5: Me',
  '    Go upstairs: 3: Me',
  '    Do work: 1: Me, Cat',
  '  section Go home',
  '    Go downstairs: 5: Me',
  '    Sit down: 5: Me',
].join('\n');

test('journey card: task in bold, score as stars, actors', () => {
  assert.deepEqual(journeyTaskText('Do work', 1, ['Me', 'Cat']), [
    { text: 'Do work', bold: true },
    { break: true },
    { text: '★☆☆☆☆' },
    { break: true },
    { text: 'Me, Cat' },
  ]);
  assert.equal(journeyTaskText('x', 9, []).length, 3, 'score clamped to 5 stars, no actor line');
});

test('journey SmartArt: two-level data model (sections, then tasks), one bar per section, one card per task', () => {
  const out = generateJourneySmartArt(parseJourney(JOURNEY).ast, { drawing: true });
  assert.equal(out?.layout, 'timeline');
  const data = out?.dataXml ?? '';
  assert.equal((data.match(/type="parOf" srcId="0"/g) ?? []).length, 2, 'two sections under the doc');
  assert.equal((data.match(/type="parOf"/g) ?? []).length, 7, '2 sections + 5 tasks');
  assert.ok(data.includes('loTypeId="urn:md2nativedocx/smartart-layout/timeline1-grouped-3-2"'));
  assert.ok(!data.includes('My working day'), 'the title is not part of the SmartArt');
  const drawing = out?.drawingXml ?? '';
  assert.equal((drawing.match(/prst="homePlate"/g) ?? []).length, 2);
  assert.equal((drawing.match(/prst="roundRect"/g) ?? []).length, 5);
  assert.ok(drawing.includes('★★★☆☆'));
});

test('grouped layout: one forEach per section sized by its steps, plus a catch-all for sections added in Word', () => {
  assert.deepEqual(sectionWeights([3, 2]), [0.6, 0.4]);
  assert.deepEqual(sectionWeights([0, 1]), [0.5, 0.5], 'an empty section still gets one slot');
  const xml = groupedTimelineLayoutXml([3, 2]);
  assert.ok(xml.includes('uniqueId="urn:md2nativedocx/smartart-layout/timeline1-grouped-3-2"'));
  assert.ok(xml.includes('forName="section0" refType="w" fact="0.6000"'));
  assert.ok(xml.includes('<dgm:forEach name="sectionForEach1" axis="ch" ptType="node" st="2" cnt="1">'));
  assert.ok(xml.includes('<dgm:forEach name="sectionForEachX" axis="ch" ptType="node" st="3">'));
  assert.ok(xml.includes('func="posOdd"'));
});

test('a timeline with sections uses the grouped time line when it fits, shapes when crowded', () => {
  const fits = parseTimeline('timeline\n  section A\n    Jan : x\n    Feb : y\n  section B\n    Mar : z').ast;
  assert.equal(timelineFitsSmartArt(fits), true);
  assert.ok(generateTimelineSmartArt(fits)?.layoutXml.includes('timeline1-grouped-2-1'));
  const crowded = ['timeline', '  section A', ...Array.from({ length: 12 }, (_, i) => `    P${i} : Anticonstitutionnellement`)].join('\n');
  assert.equal(timelineFitsSmartArt(parseTimeline(crowded).ast), false);
});

test('journey text and section names are XML-escaped in every SmartArt part', () => {
  const out = generateJourneySmartArt(parseJourney('journey\n  section <s> & co\n    <script>: 3: "me"').ast, { drawing: true });
  assert.ok(out);
  for (const part of [out.dataXml, out.drawingXml ?? '']) {
    assert.ok(!part.includes('<script>'));
    assert.ok(!part.includes('<s>'));
    assert.ok(part.includes('&lt;script&gt;'));
    assert.ok(part.includes('&lt;s&gt; &amp; co'));
  }
  assert.equal(journeyFitsSmartArt(parseJourney('journey\n  title x').ast), false, 'no task, no SmartArt');
});
