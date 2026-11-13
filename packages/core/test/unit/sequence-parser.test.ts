import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSequence } from '../../src/diagrams/sequence/parser.js';

const src = `sequenceDiagram
title Demo <b>
autonumber 10 5
participant A as Alice
actor B@{ "type": "actor" }
box Aqua Group
participant C
end
A->>+B: Hi<br/>there #59; ok
B-->>-A: back
A-xC: bad
C--)A: async
A<<->>B: both
A->>A: self
create participant D
A->>D: spawn
destroy D
D-->>A: bye
activate A
deactivate A
Note over A,B: shared
Note left of A: l
loop Retry
  alt ok
    A->B: x
  else nope
    A-->B: y
  end
end
rect rgb(10, 20, 30)
  A->>B: z
end
`;

test('parses participants, arrows, activation shorthand, notes, blocks and autonumber', () => {
  const { ast, warnings } = parseSequence(src);
  assert.deepEqual(warnings, ['Participant `box` groups are not drawn; their participants are kept.']);
  assert.equal(ast.title, 'Demo <b>');
  assert.deepEqual(ast.participants.map((p) => [p.id, p.label, p.actor]), [
    ['A', 'Alice', false],
    ['B', 'B', true],
    ['C', 'C', false],
    ['D', 'D', false],
  ]);
  const msgs = ast.items.filter((i) => i.type === 'message');
  assert.equal(msgs.length, 11);
  const first = msgs[0];
  assert.ok(first && first.type === 'message');
  assert.deepEqual([first.from, first.to, first.activate, first.deactivate, first.number], ['A', 'B', true, false, 10]);
  assert.equal(first.text, 'Hi\nthere ; ok');
  assert.equal((msgs[1] as { deactivate: boolean }).deactivate, true);
  assert.equal((msgs[1] as { number: number }).number, 15);
  assert.deepEqual(msgs.slice(2, 5).map((m) => (m.type === 'message' ? [m.head, m.dashed, m.both] : [])), [
    ['cross', false, false],
    ['open', true, false],
    ['arrow', false, true],
  ]);
  const kinds = ast.items.map((i) => i.type);
  assert.deepEqual(kinds.filter((k) => k.startsWith('block')), ['blockStart', 'blockStart', 'blockElse', 'blockEnd', 'blockEnd', 'blockStart', 'blockEnd']);
  assert.ok(ast.items.some((i) => i.type === 'note' && i.placement === 'over' && i.actors.length === 2));
  const rect = ast.items.find((i) => i.type === 'blockStart' && i.kind === 'rect');
  assert.ok(rect && rect.type === 'blockStart' && rect.color === '0A141E');
});

test('warns on unsupported constructs without throwing and closes open blocks', () => {
  const { ast, warnings } = parseSequence('sequenceDiagram\nA/|-B: half\nA()->>B: central\nlink A: x @ https://e.com\nloop forever\nA->>B: m\nnonsense');
  assert.ok(warnings.some((w) => w.includes('Half-arrow')));
  assert.ok(warnings.some((w) => w.includes('Central connections')));
  assert.ok(warnings.some((w) => w.includes('Actor menus')));
  assert.ok(warnings.some((w) => w.includes('never closed')));
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored: nonsense')));
  assert.equal(ast.items.at(-1)?.type, 'blockEnd');
});

test('caps participants and tolerates hostile input', () => {
  const many = Array.from({ length: 80 }, (_, i) => `P${i}->>P${i + 1}: x`).join('\n');
  const { ast, warnings } = parseSequence(`sequenceDiagram\n${many}`);
  assert.equal(ast.participants.length, 50);
  assert.ok(warnings.some((w) => w.includes('limited to 50 participants')));
  assert.doesNotThrow(() => parseSequence('sequenceDiagram\n' + '->>'.repeat(5000) + ':'));
});
