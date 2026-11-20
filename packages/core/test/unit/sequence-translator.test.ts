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
