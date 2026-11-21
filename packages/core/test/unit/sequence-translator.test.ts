import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSequence } from '../../src/diagrams/sequence/parser.js';
import { translateSequenceToOoxml } from '../../src/diagrams/sequence/translator.js';
import { estimateTextWidth } from '../../src/layout/layout.js';
import { EMU_PER_PX } from '../../src/translator/canvas.js';

const tr = (t: string): string => translateSequenceToOoxml(parseSequence(t).ast);
const base = `sequenceDiagram
title Flow
autonumber
actor U as User
participant S as Server
U->>+S: Hello
S->>S: think
S-xU: nope
Note over U,S: noted
alt ok
  S-->>-U: yes
else no
  S--)U: no
end
create participant M
S->>M: mail
destroy M
M-->>S: done`;

test('renders participants, messages, notes, frames, numbering and arrowheads', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const t of ['Flow', 'User', 'Server', 'M', 'Hello', 'think', 'nope', 'noted', 'alt', '[ok]', '[no]', 'mail', 'done', '1']) assert.ok(xml.includes(`>${t}<`), t);
  assert.ok(xml.includes('tailEnd'));
  assert.ok(xml.includes('prstDash val="dash"'));
});

test('escapes XML metacharacters in labels, messages, notes and titles', () => {
  const xml = tr('sequenceDiagram\ntitle <t>&\nparticipant A as <a>\nA->>B: <m> "&" \'q\'\nNote over A: <n>');
  for (const raw of ['<t>', '<a>', '<m>', '<n>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;m&gt;') && xml.includes('&lt;n&gt;') && xml.includes('&amp;'));
});

test('no external relationships; empty diagram yields a note; many items stay well-formed', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('sequenceDiagram').includes('at least one participant'));
  const many = Array.from({ length: 40 }, (_, i) => `A->>B: m${i}`).join('\n');
  assert.ok(tr(`sequenceDiagram\n${many}`).includes('m39'));
});

test('a block frame widens to hold the text of a self-message inside it', () => {
  // Known visual defect closed 2026-11-18: the frame stopped 36px right of the lifeline while the
  // self-message's text starts there, so a long text ran out of its loop box.
  const xml = tr('sequenceDiagram\n  participant A\n  participant B\n  loop Every minute\n    A->>A: Check the pending order queue again\n  end\n  A->>B: Send');
  const frame = /name="Block loop"\/>[\s\S]*?<a:off x="(\d+)" y="\d+"\/><a:ext cx="(\d+)"/.exec(xml);
  assert.ok(frame);
  const frameRight = Number(frame[1]) + Number(frame[2]);
  const textAt = xml.indexOf('Check the pending');
  assert.ok(textAt > 0);
  // The left-aligned text box is widened to the right so Word never wraps or resizes it (unwrappedTextFrame):
  // where the text ends is its left edge plus the width of its longest line, not the box's right edge.
  const boxes = [...xml.slice(0, textAt).matchAll(/<a:off x="(\d+)" y="\d+"\/><a:ext cx="(\d+)"/g)];
  const last = boxes[boxes.length - 1];
  assert.ok(last);
  const shapeXml = xml.slice(textAt - 2000, xml.indexOf('</wps:wsp>', textAt));
  const lineTexts = [...shapeXml.slice(shapeXml.lastIndexOf('<wps:wsp>')).matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) => m[1] ?? '');
  const widest = Math.max(...lineTexts.map((t) => estimateTextWidth(t, 11)));
  const textRight = Number(last[1]) + Math.round(widest * EMU_PER_PX);
  assert.ok(textRight <= frameRight, `text ends at ${textRight}, past the frame (${frameRight})`);
});

test('participant symbols: one shape per head, top and bottom, with the label below it and escaped', () => {
  const kinds = ['boundary', 'control', 'entity', 'database'];
  const src = kinds.map((k) => `participant ${k}@{ "type": "${k}" } as <${k}> & co`).join('\n');
  const xml = tr(`sequenceDiagram\nactor U\n${src}\nparticipant Q@{ "type": "queue" }\nparticipant C@{ "type": "collections" }\nU->>Q: m`);
  // Actor + 4 kinds: a symbol each at the top and the bottom.
  assert.equal(xml.match(/name="Participant symbol /g)?.length, 2 * 6, 'actor, 4 symbols and the queue cylinder');
  assert.equal(xml.match(/<a:custGeom>/g)?.length, 2 * 5, 'all but the database cylinder (a preset) are drawn paths');
  assert.equal(xml.match(/prst="can"/g)?.length, 2);
  // collections: two boxes per head.
  assert.equal(xml.match(/name="Participant C"/g)?.length, 4);
  for (const k of kinds) assert.ok(xml.includes(`&lt;${k}&gt; &amp; co`), k);
  assert.ok(!xml.includes('<boundary>'));
});

test('a created participant keeps its symbol, and the creating message stops at the symbol', () => {
  const xml = tr('sequenceDiagram\nparticipant A\ncreate participant D@{ "type": "database" }\nA->>D: open');
  const shape = /<a:off x="(\d+)" y="\d+"\/><a:ext cx="\d+" cy="\d+"\/><\/a:xfrm>\s*<a:prstGeom prst="can">/.exec(xml);
  assert.ok(shape, 'database cylinder drawn');
  // The message is the connector carrying the arrowhead; its right end is the cylinder's left edge.
  const arrow = /<a:off x="(\d+)" y="\d+"\/><a:ext cx="(\d+)" cy="1"\/><\/a:xfrm>(?:(?!<\/wps:wsp>)[\s\S])*?tailEnd type="triangle"/.exec(xml);
  assert.ok(arrow, 'message arrow drawn');
  assert.ok(Math.abs(Number(arrow[1]) + Number(arrow[2]) - Number(shape[1])) <= 1, 'arrow ends at the symbol');
});
