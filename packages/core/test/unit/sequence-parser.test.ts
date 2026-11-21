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
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.boxes, [{ label: 'Group', color: '00FFFF', participants: ['C'] }]);
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
  const { ast, warnings } = parseSequence('sequenceDiagram\nA/|-B: half\nlink A: x @ https://e.com\nloop forever\nA->>B: m\nnonsense');
  assert.ok(warnings.some((w) => w.includes('Half-arrow')));
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

// TODO R2.1: `;` ends a statement in Mermaid's sequence grammar, as it does in the other diagram types.
test('sequence: a `;` ends a statement, as in Mermaid', () => {
  const cases: Array<[string, string[], string[]]> = [
    ['A->>B: Bonjour;\n  B-->>A: Salut', ['A>B:Bonjour', 'B>A:Salut'], ['A', 'B']],
    ['A->>B: Bonjour; B-->>A: Salut', ['A>B:Bonjour', 'B>A:Salut'], ['A', 'B']],
    ['participant A;\n  A->>B: x', ['A>B:x'], ['A', 'B']],
    ['A->>B: a #59; b', ['A>B:a ; b'], ['A', 'B']],
  ];
  for (const [body, messages, participants] of cases) {
    const { ast, warnings } = parseSequence(`sequenceDiagram;\r\n  ${body}\r\n`);
    const got = ast.items.flatMap((i) => (i.type === 'message' ? [`${i.from}>${i.to}:${i.text}`] : []));
    assert.deepEqual(got, messages, body);
    assert.deepEqual(ast.participants.map((p) => p.id), participants, body);
    assert.deepEqual(warnings, [], body);
  }
});

test('sequence: text after a `;` that is not a statement is reported, not glued to the message', () => {
  const { ast, warnings } = parseSequence('sequenceDiagram\n  A->>B: a; b');
  const msgs = ast.items.filter((i) => i.type === 'message');
  assert.equal(msgs.length, 1);
  assert.equal((msgs[0] as { text: string }).text, 'a');
  assert.equal(warnings.length, 1);
});

test('sequence: a `;` in the YAML frontmatter is not a statement end', () => {
  const { ast } = parseSequence('---\ntitle: x; y\n---\nsequenceDiagram\n  A->>B: ok');
  assert.deepEqual(ast.participants.map((p) => p.id), ['A', 'B']);
});

test('participant config @{...} before `as`: no bogus participant, the `as` text is the label (Mermaid official examples)', () => {
  // sequenceDiagram#12 and #14 of Mermaid's docs: the config was only recognized at the end of the line, so
  // `API@{ "type": "boundary" } as Public API` declared a participant named after the whole text.
  const { ast, warnings } = parseSequence(
    'sequenceDiagram\n  participant API@{ "type": "boundary", "alias": "Internal" } as Public API\n  actor DB@{ "type": "database" } as User Database\n  API->>DB: Query',
  );
  assert.deepEqual(ast.participants.map((p) => [p.id, p.label]), [
    ['API', 'Public API'],
    ['DB', 'User Database'],
  ]);
  assert.deepEqual(warnings, []);
});

test('participant config "alias" is the label when there is no `as`', () => {
  const { ast } = parseSequence('sequenceDiagram\n  participant API@{ "type": "boundary", "alias": "Public API" }\n  API->>API: ping');
  assert.deepEqual(ast.participants.map((p) => [p.id, p.label]), [['API', 'Public API']]);
});

test('named entities are decoded like Mermaid (#infin;, #hearts;), unknown names and out-of-range codes stay as written', () => {
  const { ast } = parseSequence('sequenceDiagram\n  A->>B: I #hearts; you #infin; times #foo; #99999999;');
  const message = ast.items.find((i) => i.type === 'message');
  assert.equal(message?.type === 'message' ? message.text : '', 'I ♥ you ∞ times #foo; #99999999;');
});

test('participant types: the config type sets the symbol, and wins over the `actor` keyword as in Mermaid', () => {
  const kinds = ['boundary', 'control', 'entity', 'database', 'collections', 'queue'];
  const src = kinds.map((k, i) => `participant P${i}@{ "type": "${k}" }`).join('\n');
  const { ast, warnings } = parseSequence(`sequenceDiagram\n${src}\nactor DB@{ "type": "database" }\nactor U@{ "type": "actor" }\nparticipant X@{ "type": "participant" }`);
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.participants.map((p) => [p.id, p.kind, p.actor]), [
    ...kinds.map((k, i) => [`P${i}`, k, false]),
    ['DB', 'database', false],
    ['U', undefined, true],
    ['X', undefined, false],
  ]);
});

test('an unknown participant type is a plain box, with a warning that names it', () => {
  const { ast, warnings } = parseSequence('sequenceDiagram\nparticipant A@{ "type": "<rocket>" }\nA->>A: go');
  assert.equal(ast.participants[0]?.kind, undefined);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]?.includes('<rocket>'));
});

test('box: a leading CSS colour is the fill, the rest the title; participants declared inside belong to it', () => {
  const { ast, warnings } = parseSequence(`sequenceDiagram
box Purple Alice & John
participant A
participant J
end
box Another Group
participant B
end
box rgb(33,66,99)
participant C
end
box hsl(120, 100%, 25%) Green
participant D
end
box transparent Aqua
participant E
end
box #fff Hex
participant F
end
participant G
A->>G: hi`);
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.boxes, [
    { label: 'Alice & John', color: '800080', participants: ['A', 'J'] },
    { label: 'Another Group', participants: ['B'] },
    { label: '', color: '214263', participants: ['C'] },
    { label: 'Green', color: '008000', participants: ['D'] },
    { label: 'Aqua', participants: ['E'] },
    // As in Mermaid, a #hex is not read as a box colour: it is part of the title.
    { label: '#fff Hex', participants: ['F'] },
  ]);
  // `end` closes the box: G, declared after it, belongs to none; the message after the boxes still parses.
  assert.equal(ast.items.length, 1);
});

test('box: an `end` closes the box, not an enclosing block; a participant named box still sends messages', () => {
  const { ast, warnings } = parseSequence('sequenceDiagram\nbox G\nparticipant A\nend\nbox->>A: hi\nloop x\nA->>box: back\nend');
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.boxes?.map((b) => b.participants), [['A']]);
  assert.deepEqual(ast.items.map((i) => i.type), ['message', 'blockStart', 'message', 'blockEnd']);
});

test('central connections: `()` at the sender, the receiver or both, with activation shorthand', () => {
  const { ast, warnings } = parseSequence('sequenceDiagram\nA->>()B: to\nA()->>B: from\nB()->>()A: both\nA->>+()B: act\nA->>()+B: act2\nA->>B: none');
  assert.deepEqual(warnings, []);
  const msgs = ast.items.filter((i) => i.type === 'message');
  assert.deepEqual(msgs.map((m) => (m.type === 'message' ? [m.from, m.to, m.central, m.activate] : [])), [
    ['A', 'B', 'to', false],
    ['A', 'B', 'from', false],
    ['B', 'A', 'both', false],
    ['A', 'B', 'to', true],
    ['A', 'B', 'to', true],
    ['A', 'B', undefined, false],
  ]);
  assert.deepEqual(ast.participants.map((p) => p.id), ['A', 'B']);
});
