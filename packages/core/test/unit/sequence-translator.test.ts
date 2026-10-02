import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSequence } from '../../src/diagrams/sequence/parser.js';
import { translateSequenceToOoxml } from '../../src/diagrams/sequence/translator.js';

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
