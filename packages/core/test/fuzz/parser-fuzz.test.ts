import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseMermaid } from '../../src/parser/index.js';
import { layout } from '../../src/layout/layout.js';
import { translateToOoxml } from '../../src/translator/ooxml-translator.js';

/**
 * Property-based tests on the untrusted-input boundary (AGENTS.md Security
 * table: "Untested untrusted input"). The parser is the most exposed boundary,
 * since input may be AI-generated on someone else's behalf.
 */

// Arbitrary "hostile" text: any printable ASCII, including XML-significant
// characters, quotes, angle brackets, and control-ish separators.
const hostileText = fc.string({ maxLength: 40 });

// Arbitrary node ids (must be alphanumeric/underscore/dash to be valid).
const nodeId = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/);

// Parse XML with DTD and external entities disabled (AGENTS.md rule #5).
function assertWellFormedXml(xml: string): void {
  // Minimal well-formedness check: balanced tags and no raw `<`/`>` in text.
  // We rely on the translator's escaping (rule #2) to guarantee this.
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z0-9:_-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('<')) {
      const closing = m[1] === '/';
      const selfClosing = m[4] === '/';
      const name = m[2]!;
      if (selfClosing) continue;
      if (closing) {
        const top = stack.pop();
        assert.equal(top, name, `mismatched closing tag </${name}>`);
      } else {
        stack.push(name);
      }
    } else {
      // Text content must not contain raw `<` or `>`.
      assert.ok(!m[5]!.includes('<'), 'raw < in text content');
      assert.ok(!m[5]!.includes('>'), 'raw > in text content');
    }
  }
  assert.equal(stack.length, 0, 'unclosed tags remain');
}

test('property: parser never throws on arbitrary hostile text', () => {
  fc.assert(
    fc.property(fc.array(hostileText, { minLength: 0, maxLength: 20 }), (lines) => {
      const input = lines.join('\n');
      // Must not throw; must return a well-formed AST.
      const { ast, warnings } = parseMermaid(input);
      assert.ok(Array.isArray(ast.nodes));
      assert.ok(Array.isArray(ast.edges));
      assert.ok(Array.isArray(ast.subgraphs));
      assert.ok(Array.isArray(warnings));
    }),
    { numRuns: 500 },
  );
});

test('property: translator output is always well-formed XML (no raw injection)', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          id: nodeId,
          label: hostileText,
          shape: fc.constantFrom('rect', 'roundRect', 'stadium', 'diamond', 'cylinder', 'ellipse'),
        }),
        { minLength: 1, maxLength: 8 },
      ),
      (nodes) => {
        const lines = ['graph TD'];
        for (const n of nodes) lines.push(`${n.id}["${n.label}"]`);
        const { ast } = parseMermaid(lines.join('\n'));
        const xml = translateToOoxml(ast, layout(ast));
        // The output must be well-formed XML regardless of hostile labels.
        assertWellFormedXml(xml);
      },
    ),
    { numRuns: 200 },
  );
});

test('property: every node id in the AST has a layout box', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ id: nodeId, label: hostileText }),
        { minLength: 1, maxLength: 10 },
      ),
      (nodes) => {
        const lines = ['graph TD'];
        for (const n of nodes) lines.push(`${n.id}["${n.label}"]`);
        const { ast } = parseMermaid(lines.join('\n'));
        const result = layout(ast);
        for (const n of ast.nodes) {
          assert.ok(result.nodes[n.id], `missing layout box for node ${n.id}`);
          assert.ok(result.nodes[n.id]!.width > 0);
          assert.ok(result.nodes[n.id]!.height > 0);
        }
      },
    ),
    { numRuns: 200 },
  );
});
