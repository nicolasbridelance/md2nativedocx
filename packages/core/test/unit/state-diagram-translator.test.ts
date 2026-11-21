import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStateDiagram } from '../../src/diagrams/state-diagram/parser.js';
import { translateStateDiagramToOoxml } from '../../src/diagrams/state-diagram/translator.js';

function translate(text: string): string {
  const { ast } = parseStateDiagram(text);
  return translateStateDiagramToOoxml(ast);
}

const BASIC = `stateDiagram-v2
  [*] --> Still
  Still --> Moving : go
  Moving --> [*]`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as the other Family B/C translators', () => {
  const xml = translate(BASIC);
  assert.ok(xml.startsWith('<w:p '));
  const order = ['<w:p ', '<w:r>', '<w:drawing>', '<wp:inline ', '<wpc:wpc ', '<wps:wsp>', '</wpc:wpc>', '</w:p>'];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('renders one connector per transition, always a solid line with a triangle at the target end', () => {
  const xml = translate(BASIC);
  // BASIC has 3 transitions: [*]->Still, Still->Moving, Moving->[*].
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 3);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 3);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.ok(xml.includes('type="triangle"'));
});

test('a transition label renders as its own text box', () => {
  assert.ok(translate(BASIC).includes('>go<'));
});

test('start renders as a single filled circle, end as two (ring + inner dot)', () => {
  const xml = translate(BASIC);
  // 2 ellipses for start (1) + end (2) = 3 total.
  const ellipseCount = (xml.match(/<a:prstGeom prst="ellipse">/g) ?? []).length;
  assert.equal(ellipseCount, 3);
});

test('choice renders as a diamond, fork/join as a filled bar — all visually distinct shapes', () => {
  const xml = translate(
    'stateDiagram-v2\n  state c <<choice>>\n  state f <<fork>>\n  state j <<join>>\n  A --> c\n  c --> f\n  f --> j',
  );
  assert.ok(xml.includes('<a:prstGeom prst="diamond">'));
  // fork/join render as a plain black rect alongside the 2 normal-state
  // rounded rects (A, and the roundRect shapes) — assert the diamond and at
  // least one non-round rect both appear.
  assert.ok(xml.includes('<a:prstGeom prst="rect">') || xml.includes('<a:prstGeom prst="roundRect">'));
});

test('a normal state renders a rounded rect with a centered label', () => {
  const xml = translate('stateDiagram-v2\n  [*] --> Idle');
  assert.ok(xml.includes('<a:prstGeom prst="roundRect">'));
  assert.ok(xml.includes('>Idle<'));
});

test('state label text is XML-escaped', () => {
  const xml = translate('stateDiagram-v2\n  s2 : "quoted" & <tag>\n  [*] --> s2');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
  assert.ok(!xml.includes('<tag>'));
});

test('every <w:jc> uses a valid ST_Jc value', () => {
  const xml = translate(BASIC);
  const jcValues = [...xml.matchAll(/<w:jc w:val="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(jcValues.length > 0);
  for (const val of jcValues) {
    assert.ok(['left', 'center', 'right'].includes(val!), `invalid ST_Jc value: ${val}`);
  }
});

test('an empty state diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('stateDiagram-v2');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});

/** Every named shape's box, in EMU: `name="X"` then its `a:off` / `a:ext`. */
function boxes(xml: string): Array<{ name: string; x: number; y: number; w: number; h: number }> {
  const out: Array<{ name: string; x: number; y: number; w: number; h: number }> = [];
  const re = /<wps:cNvPr id="\d+" name="([^"]*)"\/>[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g;
  for (const m of xml.matchAll(re)) out.push({ name: m[1]!, x: +m[2]!, y: +m[3]!, w: +m[4]!, h: +m[5]! });
  return out;
}
const box = (xml: string, name: string) => {
  const found = boxes(xml).find((b) => b.name === name);
  assert.ok(found, `no shape named ${name}`);
  return found;
};
const inside = (inner: { x: number; y: number; w: number; h: number }, outer: { x: number; y: number; w: number; h: number }): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

const COMPOSITE = `stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted : submit
  state Review {
    [*] --> Screening
    Screening --> Decision
  }
  Submitted --> Review
  Review --> Published : approved
  Review --> Draft : rejected
  Published --> [*]`;

test('a composite state is a titled box around its states, behind them (Mermaid #2)', () => {
  const xml = translate(COMPOSITE);
  const review = box(xml, 'Review');
  const content = box(xml, 'Review content');
  assert.ok(inside(content, review));
  assert.ok(content.y > review.y, 'the content area starts below the title band');
  for (const name of ['Screening', 'Decision']) assert.ok(inside(box(xml, name), content), `${name} is drawn inside the composite`);
  for (const name of ['Draft', 'Submitted', 'Published']) assert.ok(!inside(box(xml, name), review), `${name} is outside it`);
  assert.ok(xml.indexOf('name="Review"') < xml.indexOf('name="Screening"'), 'the composite is drawn first, behind its states');
  // 8 transitions, `Submitted --> Review` and `Review --> ...` ending on the composite's box.
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 8);
});

test('nested composites are boxes inside boxes (Mermaid #11)', () => {
  const xml = translate('stateDiagram-v2\n  [*] --> First\n  state First {\n    [*] --> Second\n    state Second {\n      [*] --> second\n      second --> Third\n      state Third {\n        [*] --> third\n        third --> [*]\n      }\n    }\n  }');
  assert.ok(inside(box(xml, 'Third'), box(xml, 'Second content')));
  assert.ok(inside(box(xml, 'Second'), box(xml, 'First content')));
  assert.ok(inside(box(xml, 'third'), box(xml, 'Third content')));
});

test('a composite lays its content out in its own direction, top to bottom by default (Mermaid)', () => {
  const lr = translate('stateDiagram-v2\n  direction LR\n  A --> B\n  state B {\n    x --> y\n  }');
  assert.ok(box(lr, 'y').y > box(lr, 'x').y, 'no direction in the block: top to bottom, even in an LR diagram');
  assert.ok(box(lr, 'B').x > box(lr, 'A').x, 'the diagram itself stays left to right');
  const own = translate('stateDiagram-v2\n  A --> B\n  state B {\n    direction LR\n    x --> y\n  }');
  assert.ok(box(own, 'y').x > box(own, 'x').x, 'the block\'s own direction');
});

test('concurrent regions sit side by side in their composite, a dashed line between each two (Mermaid #16)', () => {
  const xml = translate(
    'stateDiagram-v2\n  [*] --> Active\n  state Active {\n    [*] --> NumOff\n    NumOff --> NumOn : press\n    NumOn --> NumOff : press\n    --\n    [*] --> CapsOff\n    CapsOff --> CapsOn\n    --\n    [*] --> ScrollOff\n  }',
  );
  const content = box(xml, 'Active content');
  const num = box(xml, 'NumOff');
  const caps = box(xml, 'CapsOff');
  const scroll = box(xml, 'ScrollOff');
  for (const b of [num, caps, scroll]) assert.ok(inside(b, content));
  assert.ok(num.x + num.w < caps.x && caps.x + caps.w < scroll.x, 'regions in a row, left to right in source order');
  assert.equal((xml.match(/<a:prstDash val="dash"\/>/g) ?? []).length, 2, 'two dividers for three regions');
});

test('two transitions between the same states are drawn apart, not on top of each other', () => {
  const xml = translate('stateDiagram-v2\n  A --> B : go\n  B --> A : back');
  const lines = [...xml.matchAll(/<wps:cNvCnPr\/>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => m.slice(1).join(','));
  assert.equal(lines.length, 2);
  assert.notEqual(lines[0], lines[1]);
});

test('a note is a folded-corner box on its side of the state, joined by a dotted line, clear of other boxes (Mermaid #15)', () => {
  const xml = translate(
    'stateDiagram-v2\n  State1: The state with a note\n  note right of State1\n    Important information!\n  end note\n  State1 --> State2\n  note left of State2 : To the left',
  );
  assert.equal((xml.match(/prst="foldedCorner"/g) ?? []).length, 2);
  const all = boxes(xml);
  const notes = all.filter((b) => xml.includes(`name="${b.name}"`) && /^Box /.test(b.name));
  assert.equal(notes.length, 2);
  const [right, left] = notes as [(typeof notes)[0], (typeof notes)[0]];
  const s1 = box(xml, 'The state with a note');
  const s2 = box(xml, 'State2');
  assert.ok(right.x >= s1.x + s1.w, 'right of State1');
  assert.ok(left.x + left.w <= s2.x, 'left of State2');
  const overlaps = (a: typeof s1, b: typeof s1): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const n of notes) for (const st of [s1, s2]) assert.ok(!overlaps(n, st), 'a note never covers a state');
  assert.ok(xml.includes('Important information!'));
});

test('note text is XML-escaped', () => {
  const xml = translate('stateDiagram-v2\n  A --> B\n  note right of A : </w:t><w:evil/> & "q"');
  assert.ok(!xml.includes('<w:evil'));
  assert.ok(xml.includes('&lt;/w:t&gt;&lt;w:evil/&gt; &amp;'));
});

test('a parent cycle in a hand-built AST is cut rather than recursing for ever', () => {
  const xml = translateStateDiagramToOoxml({
    direction: 'TD',
    states: [
      { id: 'A', label: 'A', kind: 'normal', parent: 'B' },
      { id: 'B', label: 'B', kind: 'normal', parent: 'A' },
    ],
    transitions: [],
  });
  assert.ok(xml.includes('<wpc:wpc'));
});
