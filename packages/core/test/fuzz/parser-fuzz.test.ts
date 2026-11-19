import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseMermaid } from '../../src/parser/index.js';
import { layout } from '../../src/layout/layout.js';
import { translateToOoxml } from '../../src/translator/ooxml-translator.js';
import { renderDiagramOdf } from '../../src/render-diagram-odf.js';

/**
 * Property-based tests on the untrusted-input boundary (AGENTS.md Security
 * table: "Untested untrusted input"). The parser is the most exposed boundary,
 * since input may be AI-generated on someone else's behalf.
 */

// Arbitrary "hostile" text: any printable ASCII, including XML-significant
// characters, quotes, angle brackets, and control-ish separators.
// `unit: 'binary'` also yields C0 controls, U+FFFE/U+FFFF and lone surrogates,
// which XML 1.0 forbids even as character references.
const hostileText = fc.oneof(fc.string({ maxLength: 40 }), fc.string({ unit: 'binary', maxLength: 40 }));

// Arbitrary node ids (must be alphanumeric/underscore/dash to be valid).
const nodeId = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/);

// Parse XML with DTD and external entities disabled (AGENTS.md rule #5).
function assertWellFormedXml(xml: string): void {
  // Minimal well-formedness check: balanced tags and no raw `<`/`>` in text.
  // We rely on the translator's escaping (rule #2) to guarantee this.
  assert.ok(
    // eslint-disable-next-line no-control-regex -- matching control characters is the whole point
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(xml),
    'character forbidden in XML 1.0',
  );
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

test('property: ODF output is always well-formed XML, with no hostile markup (AGENTS.md rules 2 and 3)', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ id: nodeId, label: hostileText, edge: hostileText }), { minLength: 1, maxLength: 8 }),
      hostileText,
      (nodes, title) => {
        const lines = ['graph TD', `subgraph S["${title}"]`];
        nodes.forEach((n, i) => {
          lines.push(`${n.id}["${n.label}"]`);
          if (i > 0) lines.push(`${nodes[i - 1]!.id} -->|${n.edge}| ${n.id}`);
        });
        lines.push('end');
        const { fragment, automaticStyles } = renderDiagramOdf(lines.join('\n'), { idPrefix: 'f' });
        assertWellFormedXml(fragment);
        for (const style of automaticStyles) assertWellFormedXml(style);
        const all = fragment + automaticStyles.join('');
        for (const element of ['office:scripts', 'event-listener', 'text:a', 'draw:a', 'draw:image', 'draw:object']) {
          assert.ok(!all.includes(`<${element}`), element);
        }
      },
    ),
    { numRuns: 200 },
  );
});

test('property: PlantUML sequence input never throws and always gives well-formed, escaped XML', async () => {
  const { renderDiagram } = await import('../../src/render-diagram.js');
  const plantLine = fc.oneof(
    hostileText,
    fc.tuple(nodeId, fc.constantFrom('->', '-->', '->>', '->x', '<-', '<->', '-/', '-[#red]>'), nodeId, hostileText).map(([a, arrow, b, t]) => `${a} ${arrow} ${b} : ${t}`),
    fc.tuple(fc.constantFrom('participant', 'actor', 'database', 'queue'), hostileText, nodeId).map(([k, label, id]) => `${k} "${label}" as ${id}`),
    fc.tuple(fc.constantFrom('note over A :', 'alt', 'else', 'group', 'loop', 'ref over A :', '== ', 'title'), hostileText).map(([k, t]) => `${k} ${t}`),
    fc.constantFrom('end', 'return', 'activate A', 'deactivate A', 'end note', '@enduml', 'A -> B ++ : x', 'B -> C ** : y'),
  );
  fc.assert(
    fc.property(fc.array(plantLine, { minLength: 0, maxLength: 25 }), (lines) => {
      const result = renderDiagram(`@startuml\n${lines.join('\n')}\n@enduml`);
      assertWellFormedXml(result.fragment);
    }),
    { numRuns: 300 },
  );
});

test('property: PlantUML activity input never throws and always gives well-formed, escaped XML', async () => {
  const { renderDiagram } = await import('../../src/render-diagram.js');
  const activityLine = fc.oneof(
    hostileText.map((t) => `:${t};`),
    hostileText.map((t) => `:${t}`),
    hostileText.map((t) => `-> ${t};`),
    fc.tuple(fc.constantFrom('if (', 'elseif (', 'while (', 'switch (', 'case (', 'repeat while ('), hostileText, fc.constantFrom(') then (yes)', ')', ') is (x)')).map(([a, t, b]) => `${a}${t}${b}`),
    hostileText.map((t) => `partition "${t}" {`),
    hostileText.map((t) => `|${t}|`),
    fc.constantFrom('start', 'stop', 'end', 'else', 'endif', 'endwhile', 'endswitch', 'repeat', 'break', 'fork', 'fork again', 'end fork', '}', 'kill', 'label l', 'goto l', '-[hidden]->', 'note right', 'end note', '@enduml'),
  );
  fc.assert(
    fc.property(fc.array(activityLine, { minLength: 0, maxLength: 25 }), (lines) => {
      const result = renderDiagram(`@startuml\n${lines.join('\n')}\n@enduml`);
      assertWellFormedXml(result.fragment);
    }),
    { numRuns: 300 },
  );
});

test('property: PlantUML state input never throws and always gives well-formed, escaped XML', async () => {
  const { renderDiagram } = await import('../../src/render-diagram.js');
  const stateLine = fc.oneof(
    hostileText,
    fc
      .tuple(fc.oneof(nodeId, fc.constant('[*]')), fc.constantFrom('-->', '->', '-up->', '-[#red]->', 'x->o', '<--', '-[hidden]->'), fc.oneof(nodeId, fc.constantFrom('[*]', '[H]', 'X[H*]')), hostileText)
      .map(([a, arrow, b, t]) => `${a} ${arrow} ${b} : ${t}`),
    fc.tuple(hostileText, nodeId, fc.constantFrom('', ' <<choice>>', ' <<fork>>', ' <<end>>', ' <<sdlreceive>>', ' {')).map(([label, id, tail]) => `state "${label}" as ${id}${tail}`),
    fc.tuple(nodeId, hostileText).map(([id, t]) => `${id} : ${t}`),
    fc.constantFrom('}', '--', '||', 'note left of A', 'end note', 'skinparam state {', '<style>', '</style>', 'json j {', '@enduml'),
  );
  fc.assert(
    fc.property(fc.array(stateLine, { minLength: 0, maxLength: 25 }), (lines) => {
      const result = renderDiagram(`@startuml\n${lines.join('\n')}\n@enduml`);
      assertWellFormedXml(result.fragment);
    }),
    { numRuns: 300 },
  );
});

test('property: PlantUML class input never throws and always gives well-formed, escaped XML', async () => {
  const { renderDiagram } = await import('../../src/render-diagram.js');
  const classLine = fc.oneof(
    hostileText,
    fc
      .tuple(nodeId, fc.constantFrom('<|--', '*--', 'o--', '-->', '..>', '..|>', '--', '..', '-up->', '#--', '()-'), nodeId, hostileText)
      .map(([a, arrow, b, t]) => `${a} "${t}" ${arrow} ${b} : ${t}`),
    fc.tuple(fc.constantFrom('class', 'abstract class', 'interface', 'enum', 'object', 'json'), hostileText, nodeId).map(([k, label, id]) => `${k} "${label}" as ${id} {`),
    fc.tuple(nodeId, hostileText).map(([id, t]) => `${id} : ${t}`),
    fc.constantFrom('}', 'package p {', 'note left of A', 'end note', 'skinparam class {', '<style>', '</style>', '@enduml', 'left to right direction'),
  );
  fc.assert(
    fc.property(fc.array(classLine, { minLength: 0, maxLength: 25 }), (lines) => {
      const result = renderDiagram(`@startuml\n${lines.join('\n')}\n@enduml`);
      assertWellFormedXml(result.fragment);
    }),
    { numRuns: 300 },
  );
});
