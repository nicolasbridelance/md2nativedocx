import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePacketDiagram } from '../../src/diagrams/packet/parser.js';

test('parses single-bit, range and +count fields; +count follows the previous field', () => {
  const { ast, warnings } = parsePacketDiagram('packet\ntitle UDP\n+16: "A"\n+16: "B"\n32-47: "C" %% note\n48: "D"');
  assert.equal(ast.title, 'UDP');
  assert.deepEqual(ast.fields, [
    { start: 0, end: 15, label: 'A' },
    { start: 16, end: 31, label: 'B' },
    { start: 32, end: 47, label: 'C' },
    { start: 48, end: 48, label: 'D' },
  ]);
  assert.deepEqual(warnings, []);
});

test('title from frontmatter; other frontmatter keys warn once', () => {
  const r = parsePacketDiagram('---\ntitle: "TCP Packet"\nconfig:\n  packet:\n    showBits: true\n---\npacket\n0-7: "x"');
  assert.equal(r.ast.title, 'TCP Packet');
  assert.equal(r.warnings.length, 1);
});

test('rejects reversed ranges, zero-bit and oversized fields, malformed lines', () => {
  const r = parsePacketDiagram('packet\n9-3: "x"\n+0: "y"\n0-99999999: "z"\nnonsense\n5: unquoted\n0-1: "ok"');
  assert.equal(r.ast.fields.length, 1);
  assert.equal(r.warnings.length, 5);
});

test('label keeps injection characters verbatim', () => {
  assert.equal(parsePacketDiagram('packet\n0: "<a:t>&\'"').ast.fields[0]?.label, "<a:t>&'");
});
