import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseZenuml } from '../../src/diagrams/zenuml/parser.js';
import { translateSequenceToOoxml } from '../../src/diagrams/sequence/translator.js';

const src = `zenuml
title Demo
@Actor Client
@Database DB
B as Backend
Client->B.book(id) {
  DB.find(id) {
    return row
  }
  if(ok) {
    order = DB.save(id)
    new Mailer(id)
  } else if(maybe) {
    B->DB: x
  } else {
    return nope
  }
  while(retry) {
    B->DB: poll
  }
  return fine
}
try {
  Client->B: go
} catch {
  Client->B: stop
} finally {
  Client->B: end
}
opt {
  B.audit()
}
par {
  Client->DB: a
}
@return
B->Client: late
// comment`;

test('parses participants, annotators, sync/async/creation/reply messages and fragments', () => {
  const { ast, warnings } = parseZenuml(src);
  assert.deepEqual(warnings, ['ZenUML participant annotators other than @Actor are drawn as plain participant boxes.']);
  assert.equal(ast.title, 'Demo');
  assert.deepEqual(ast.participants.map((p) => [p.id, p.label, p.actor]), [
    ['_starter', 'Starter', false], // from the top-level `B.audit()`
    ['Client', 'Client', true],
    ['DB', 'DB', false],
    ['B', 'Backend', false],
    ['Mailer', 'Mailer', false],
  ]);
  const msgs = ast.items.filter((i) => i.type === 'message');
  const first = msgs[0];
  assert.ok(first && first.type === 'message');
  assert.deepEqual([first.from, first.to, first.text, first.activate, first.dashed], ['Client', 'B', 'book(id)', true, false]);
  assert.ok(msgs.some((m) => m.type === 'message' && m.from === 'DB' && m.to === 'B' && m.text === 'row' && m.dashed));
  assert.ok(msgs.some((m) => m.type === 'message' && m.from === 'DB' && m.to === 'B' && m.text === 'order' && m.dashed));
  assert.ok(msgs.some((m) => m.type === 'message' && m.to === 'Mailer' && m.text === 'new Mailer(id)'));
  assert.ok(ast.items.some((i) => i.type === 'create' && i.actor === 'Mailer'));
  const last = msgs.at(-1);
  assert.ok(last && last.type === 'message' && last.text === 'late' && last.dashed);
  const kinds = ast.items.filter((i) => i.type === 'blockStart').map((i) => (i.type === 'blockStart' ? i.kind : ''));
  assert.deepEqual(kinds, ['alt', 'loop', 'break', 'opt', 'par']);
  const elses = ast.items.filter((i) => i.type === 'blockElse').map((i) => (i.type === 'blockElse' ? i.label : ''));
  assert.deepEqual(elses, ['maybe', 'else', 'catch', 'finally']);
  assert.equal(ast.items.filter((i) => i.type === 'blockStart').length, ast.items.filter((i) => i.type === 'blockEnd').length);
  assert.equal(ast.items.filter((i) => i.type === 'deactivate').length, 2);
});

test('a top-level call comes from an implicit leftmost Starter', () => {
  const { ast } = parseZenuml('zenuml\nA.go()');
  assert.deepEqual(ast.participants.map((p) => p.id), ['_starter', 'A']);
  assert.equal(ast.participants[0]?.label, 'Starter');
});

test('warns without throwing on stray braces, unknown lines and unclosed blocks; caps hostile input', () => {
  const { warnings, ast } = parseZenuml('zenuml\n}\n???\nwhile(x) {\nA.b() {');
  assert.ok(warnings.some((w) => w.includes('without an open block')));
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored: ???')));
  assert.ok(warnings.some((w) => w.includes('never closed')));
  assert.equal(ast.items.at(-1)?.type, 'blockEnd');
  const deep = 'zenuml\n' + 'if(x) {\n'.repeat(60);
  assert.doesNotThrow(() => parseZenuml(deep));
  const many = 'zenuml\n' + Array.from({ length: 80 }, (_, i) => `P${i}->Q${i}: x`).join('\n');
  assert.equal(parseZenuml(many).ast.participants.length, 50);
});

test('renders through the sequence translator with XML escaping', () => {
  const xml = translateSequenceToOoxml(parseZenuml('zenuml\ntitle <t>\nA->B: <m> & "q"\nB.run(<x>) {\n  return <r>\n}').ast);
  for (const raw of ['<t>', '<m>', '<x>', '<r>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;m&gt;') && xml.includes('&amp;'));
  assert.ok(!xml.includes('TargetMode'));
});
