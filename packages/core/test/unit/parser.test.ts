import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';

test('parses a simple TD flowchart', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A[Start] --> B[End]');
  assert.equal(ast.direction, 'TD');
  assert.equal(ast.nodes.length, 2);
  assert.equal(ast.edges.length, 1);
  assert.equal(ast.edges[0]!.from, 'A');
  assert.equal(ast.edges[0]!.to, 'B');
  assert.equal(ast.edges[0]!.type, 'arrow');
  assert.equal(warnings.length, 0);
});

test('parses LR direction', () => {
  const { ast } = parseMermaid('flowchart LR\n  A --> B');
  assert.equal(ast.direction, 'LR');
});

test('TB is recognized as Mermaid\'s own documented alias for TD', () => {
  const { ast, warnings } = parseMermaid('graph TB\n  A --> B');
  assert.equal(ast.direction, 'TD');
  assert.equal(warnings.length, 0);
});

test('BT and RL are recognized as their own distinct directions, not folded into TD', () => {
  const bt = parseMermaid('graph BT\n  A --> B');
  assert.equal(bt.ast.direction, 'BT');
  assert.equal(bt.warnings.length, 0);
  assert.equal(bt.ast.edges.length, 1, 'the rest of the diagram must still parse');

  const rl = parseMermaid('graph RL\n  A --> B');
  assert.equal(rl.ast.direction, 'RL');
  assert.equal(rl.warnings.length, 0);
});

test('parses node shapes (spec §6.1)', () => {
  const { ast } = parseMermaid(
    'graph TD\n  A[rect]\n  B(round)\n  C([stadium])\n  D{diamond}\n  E[(cylinder)]\n  F((ellipse))',
  );
  const byId = new Map(ast.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('A')!.shape, 'rect');
  assert.equal(byId.get('B')!.shape, 'roundRect');
  assert.equal(byId.get('C')!.shape, 'stadium');
  assert.equal(byId.get('D')!.shape, 'diamond');
  assert.equal(byId.get('E')!.shape, 'cylinder');
  assert.equal(byId.get('F')!.shape, 'ellipse');
});

test('parses the extended node shapes (hexagon, parallelogram, trapezoid, subroutine, doubleCircle)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  A{{hexagon}}\n  B[/para/]\n  C[\\paraAlt\\]\n  D[/trap\\]\n  E[\\trapAlt/]\n  F[[subroutine]]\n  G(((double)))',
  );
  const byId = new Map(ast.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('A')!.shape, 'hexagon');
  assert.equal(byId.get('B')!.shape, 'parallelogram');
  assert.equal(byId.get('C')!.shape, 'parallelogramAlt');
  assert.equal(byId.get('D')!.shape, 'trapezoid');
  assert.equal(byId.get('E')!.shape, 'trapezoidAlt');
  assert.equal(byId.get('F')!.shape, 'subroutine');
  assert.equal(byId.get('G')!.shape, 'doubleCircle');
  assert.equal(byId.get('A')!.label, 'hexagon');
  assert.equal(byId.get('G')!.label, 'double');
  assert.equal(warnings.length, 0);
});

test('parses the generic @{shape: ...} syntax on a standalone node declaration (spec §6.1 addendum, v11.3+)', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A@{ shape: hourglass, label: "Wait" }');
  assert.equal(ast.nodes.length, 1);
  assert.equal(ast.nodes[0]!.shape, 'hourglass');
  assert.equal(ast.nodes[0]!.label, 'Wait');
  assert.equal(warnings.length, 0);
});

test('@{shape: ...} label defaults to the node id when omitted', () => {
  const { ast } = parseMermaid('graph TD\n  A@{ shape: doc }');
  assert.equal(ast.nodes[0]!.shape, 'document');
  assert.equal(ast.nodes[0]!.label, 'A');
});

test('@{shape: ...} works at an edge endpoint and aliases resolve to the right internal shape', () => {
  const { ast } = parseMermaid(
    'graph TD\n  A@{ shape: das } --> B@{ shape: manual-input, label: "Enter value" }',
  );
  const byId = new Map(ast.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('A')!.shape, 'horizontalCylinder');
  assert.equal(byId.get('B')!.shape, 'manualInput');
  assert.equal(byId.get('B')!.label, 'Enter value');
});

test('@{shape: ...} aliases that map onto an existing bracket-syntax shape resolve identically', () => {
  const { ast } = parseMermaid(
    'graph TD\n  A@{shape: rounded}\n  B@{shape: decision}\n  C@{shape: cyl}\n  D@{shape: subproc}',
  );
  const byId = new Map(ast.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('A')!.shape, 'roundRect');
  assert.equal(byId.get('B')!.shape, 'diamond');
  assert.equal(byId.get('C')!.shape, 'cylinder');
  assert.equal(byId.get('D')!.shape, 'subroutine');
});

test('a quoted @{...} label containing a comma is not fragmented by the property scanner', () => {
  const { ast } = parseMermaid('graph TD\n  A@{ shape: card, label: "Hello, World" }');
  assert.equal(ast.nodes[0]!.label, 'Hello, World');
});

test('an unrecognized @{shape: ...} name degrades to rect instead of losing the node (spec §10)', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A@{ shape: totally-made-up, label: "Still here" }');
  assert.equal(ast.nodes.length, 1);
  assert.equal(ast.nodes[0]!.shape, 'rect');
  assert.equal(ast.nodes[0]!.label, 'Still here');
  assert.equal(warnings.length, 0);
});

test('parses the asymmetric/flag shape (id>Text])', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A>Flag text]-->B');
  assert.equal(ast.nodes.length, 2);
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.shape, 'asymmetric');
  assert.equal(a.label, 'Flag text');
  assert.equal(warnings.length, 0);
});

test('parses edge types (spec §6.2)', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  C -.-> D\n  E ==> F\n  G --- H');
  const types = ast.edges.map((e) => e.type);
  assert.deepEqual(types, ['arrow', 'dotted', 'thick', 'line']);
});

test('parses edge labels', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|yes| B');
  assert.equal(ast.edges[0]!.label, 'yes');
});

test('parses the extended edge types (multidirectional heads and invisible links, spec §6.2)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  A -.- B\n  C === D\n  E <--> F\n  G --o H\n  I --x J\n  K o--o L\n  M x--x N\n  O ~~~ P',
  );
  const types = ast.edges.map((e) => e.type);
  assert.deepEqual(types, [
    'dottedLine',
    'thickLine',
    'bidirectional',
    'circle',
    'cross',
    'circleBoth',
    'crossBoth',
    'invisible',
  ]);
  assert.equal(ast.nodes.length, 16);
  assert.equal(warnings.length, 0);
});

test('parses length-modified edges (extra dashes/dots/equals extend the link, spec §6.2 "extra length")', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  A---->B\n  C-----D\n  E====>F\n  G=====H\n  I-..->J\n  K-...-L',
  );
  const types = ast.edges.map((e) => e.type);
  assert.deepEqual(types, ['arrow', 'line', 'thick', 'thickLine', 'dotted', 'dottedLine']);
  assert.equal(warnings.length, 0);
});

test('a mid-chain-label edge is not swallowed by the length-modifier regexes (2-dash/2-equals opener)', () => {
  const { ast } = parseMermaid('graph TD\n  A-- Yes -->B\n  C== Big ==>D\n  E-. Maybe .->F');
  assert.deepEqual(
    ast.edges.map((e) => [e.type, e.label]),
    [
      ['arrow', 'Yes'],
      ['thick', 'Big'],
      ['dotted', 'Maybe'],
    ],
  );
});

test('an undocumented extra-length circle/cross head (e.g. ----o) fails safely rather than creating a spurious node', () => {
  // Mermaid's own docs only extend "extra length" to line/arrow/thick/dotted
  // (verified against flowchart.md), not --o/--x — this must still degrade
  // the same way the whole construct always has (whole line rejected), not
  // regress into parsing a fragment of the operator as a bogus node id.
  const { ast, warnings } = parseMermaid('graph TD\n  A----o B');
  assert.equal(ast.nodes.length, 0);
  assert.equal(ast.edges.length, 0);
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored')));
});

test('does not mistake dashes inside a bracketed label for an edge operator', () => {
  // Regression: the edge-operator scanner must only match outside bracket
  // nesting, or a label like "Step 1 --- Step 2" would fragment the node.
  const { ast, warnings } = parseMermaid('graph TD\n  A[Step 1 --- Step 2]');
  assert.equal(ast.nodes.length, 1);
  assert.equal(ast.nodes[0]!.label, 'Step 1 --- Step 2');
  assert.equal(ast.edges.length, 0);
  assert.equal(warnings.length, 0);
});

test('parses a same-line edge chain (A --> B --> C)', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B --> C --> D');
  assert.equal(ast.nodes.length, 4);
  assert.equal(ast.edges.length, 3);
  assert.deepEqual(
    ast.edges.map((e) => [e.from, e.to]),
    [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('parses fan-out with & (A --> B & C)', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B & C');
  assert.equal(ast.nodes.length, 3);
  assert.deepEqual(
    ast.edges.map((e) => [e.from, e.to]),
    [
      ['A', 'B'],
      ['A', 'C'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('parses fan-in with & (A & B --> C)', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A & B --> C');
  assert.equal(ast.nodes.length, 3);
  assert.deepEqual(
    ast.edges.map((e) => [e.from, e.to]),
    [
      ['A', 'C'],
      ['B', 'C'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('parses a chained edge with a label mid-chain (A -->|x| B --> C)', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|x| B --> C');
  assert.equal(ast.edges.length, 2);
  assert.equal(ast.edges[0]!.label, 'x');
  assert.equal(ast.edges[1]!.label, null);
});

test('parses a mid-chain label (A-- text -->B), the Mermaid-recommended alternative to |label|', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A-- Yes -->B');
  assert.equal(ast.edges.length, 1);
  assert.equal(ast.edges[0]!.type, 'arrow');
  assert.equal(ast.edges[0]!.label, 'Yes');
  assert.equal(warnings.length, 0);
});

test('parses mid-chain labels across all supported edge families (dotted, thick, line, circle, cross)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  A-. hi .->B\n  C== hi ==>D\n  E-- hi ---F\n  G-- hi --oH\n  I-- hi --xJ',
  );
  assert.deepEqual(
    ast.edges.map((e) => [e.type, e.label]),
    [
      ['dotted', 'hi'],
      ['thick', 'hi'],
      ['line', 'hi'],
      ['circle', 'hi'],
      ['cross', 'hi'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('mid-chain labels work in a same-line chain and are independent per segment', () => {
  const { ast } = parseMermaid('graph TD\n  A-- Yes -->B-- No -->C');
  assert.equal(ast.edges.length, 2);
  assert.deepEqual(
    ast.edges.map((e) => [e.from, e.to, e.label]),
    [
      ['A', 'B', 'Yes'],
      ['B', 'C', 'No'],
    ],
  );
});

test('a mid-label open marker with no closing marker on the line is reported, not silently mis-parsed', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A-- dangling text');
  assert.equal(ast.edges.length, 0);
  assert.equal(ast.nodes.length, 0);
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored')));
});

test('parses subgraphs', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1[Group]\n    A --> B\n  end');
  assert.equal(ast.subgraphs.length, 1);
  assert.equal(ast.subgraphs[0]!.id, 'S1');
  assert.equal(ast.subgraphs[0]!.title, 'Group');
  assert.deepEqual(ast.subgraphs[0]!.nodeIds, ['A', 'B']);
});

test('ignores comments', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  %% a comment\n  A --> B');
  assert.equal(ast.nodes.length, 2);
  assert.equal(warnings.length, 0);
});

test('warns on unsupported constructs but keeps going', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B\n  click A "https://example.com"');
  assert.equal(ast.nodes.length, 2);
  assert.ok(warnings.some((w) => w.includes('Unsupported')));
});

test('parses classDef fill and applies it inline (spec §6.3)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  classDef crit fill:#FF0000\n  A[Start]:::crit --> B[End]',
  );
  assert.equal(warnings.length, 0);
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.fill, 'FF0000');
  const b = ast.nodes.find((n) => n.id === 'B')!;
  assert.equal(b.fill, undefined);
});

test('parses classDef fill and applies it via class statement', () => {
  const { ast } = parseMermaid(
    'graph TD\n  classDef crit fill:#00FF00\n  A[Start] --> B[End]\n  class A crit',
  );
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.fill, '00FF00');
});

test('class/::: resolves even when the class statement comes before its classDef', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  class A crit\n  A[Start] --> B[End]\n  classDef crit fill:#FF0000',
  );
  assert.equal(warnings.length, 0);
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.fill, 'FF0000');
});

test('::: shorthand also resolves when the classDef comes later, at an edge endpoint and standalone', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  A[Start]:::crit --> B[End]\n  C:::warn\n  classDef crit fill:#FF0000\n  classDef warn fill:#00FF00',
  );
  assert.equal(warnings.length, 0);
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.fill, 'FF0000');
  assert.equal(ast.nodes.find((n) => n.id === 'C')!.fill, '00FF00');
});

test('a class name still undefined after the whole document is parsed still warns (deferred, not swallowed)', () => {
  const { warnings } = parseMermaid('graph TD\n  class A neverDefined\n  A --> B');
  assert.ok(warnings.some((w) => w.includes('classDef "neverDefined" referenced but not defined.')));
});

test('classDef no longer requires fill: to be first or the only property (spec §6.3)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  classDef crit stroke:#333333,fill:#FF0000\n  A[Start]:::crit --> B[End]',
  );
  assert.equal(warnings.length, 0);
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.fill, 'FF0000');
  assert.equal(a.stroke, '333333');
});

test('a single classDef can be shared by multiple class names (spec §6.3)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  classDef alert,warn fill:#FF0000\n  A --> B\n  class A alert\n  class B warn',
  );
  assert.equal(warnings.length, 0);
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.fill, 'FF0000');
  assert.equal(ast.nodes.find((n) => n.id === 'B')!.fill, 'FF0000');
});

test('parses a direct style statement without a classDef (spec §6.3)', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B\n  style A fill:#ABCDEF,stroke:#123456');
  assert.equal(warnings.length, 0);
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.fill, 'ABCDEF');
  assert.equal(a.stroke, '123456');
});

test('a style statement targeting a node declared later in the source still applies (deferred, like class)', () => {
  const { ast } = parseMermaid('graph TD\n  style A fill:#ABCDEF\n  A --> B');
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.fill, 'ABCDEF');
});

test('expands a 3-digit hex shorthand color to 6 digits', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  style A fill:#f9c');
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.fill, 'FF99CC');
});

test('parses linkStyle by index (spec §6.3)', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  A --> B\n  B --> C\n  linkStyle 1 stroke:#FF0000,stroke-width:4px',
  );
  assert.equal(warnings.length, 0);
  assert.equal(ast.edges[0]!.stroke, undefined);
  assert.equal(ast.edges[1]!.stroke, 'FF0000');
  assert.equal(ast.edges[1]!.strokeWidth, 4);
});

test('parses linkStyle default, applying to every edge', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C\n  linkStyle default stroke:#00FF00');
  assert.equal(ast.edges[0]!.stroke, '00FF00');
  assert.equal(ast.edges[1]!.stroke, '00FF00');
});

test('parses linkStyle with a comma-separated index list', () => {
  const { ast } = parseMermaid(
    'graph TD\n  A --> B\n  B --> C\n  C --> D\n  linkStyle 0,2 stroke:#0000FF',
  );
  assert.equal(ast.edges[0]!.stroke, '0000FF');
  assert.equal(ast.edges[1]!.stroke, undefined);
  assert.equal(ast.edges[2]!.stroke, '0000FF');
});

test('an out-of-range linkStyle index is silently skipped rather than crashing', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B\n  linkStyle 5 stroke:#FF0000');
  assert.equal(ast.edges[0]!.stroke, undefined);
  assert.equal(warnings.length, 0);
});

test('an unrecognized style color value (named color) is dropped, not applied as a bogus hex', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B\n  style A fill:red');
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.fill, undefined);
  assert.equal(warnings.length, 0);
});

test('warns when a class references an undefined classDef', () => {
  const { warnings } = parseMermaid('graph TD\n  A[Start]:::missing --> B[End]');
  assert.ok(warnings.some((w) => w.includes('not defined')));
});

test('the ::: class shorthand applies on a standalone node declaration, not just at an edge endpoint', () => {
  const { ast, warnings } = parseMermaid(
    'graph TD\n  classDef crit fill:#f00\n  A[Start]:::crit\n  A --> B',
  );
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.fill, 'FF0000');
  assert.equal(warnings.length, 0);
});

test('bare (bracket-less) standalone id:::class also applies', () => {
  const { ast } = parseMermaid('graph TD\n  classDef crit fill:#f00\n  A:::crit\n  A --> B');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.fill, 'FF0000');
  assert.equal(a.label, 'A');
});

test('strips surrounding double quotes from a node label (Mermaid\'s recommended Unicode syntax)', () => {
  const { ast } = parseMermaid('graph TD\n  A["Hello, World"] --> B[Plain]');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.label, 'Hello, World');
  const b = ast.nodes.find((n) => n.id === 'B')!;
  assert.equal(b.label, 'Plain');
});

test('strips quotes from a quoted node label at an edge endpoint reference', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B["Quoted"]');
  const b = ast.nodes.find((n) => n.id === 'B')!;
  assert.equal(b.label, 'Quoted');
});

test('strips surrounding double quotes from an edge label', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|"Yes"| B');
  assert.equal(ast.edges[0]!.label, 'Yes');
});

test('does not strip an internal, non-surrounding quote', () => {
  const { ast } = parseMermaid('graph TD\n  A[He said "hi"]');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.label, 'He said "hi"');
});

test('<br/> (and variants) in a label becomes a space rather than leaking the raw tag', () => {
  const { ast } = parseMermaid('graph TD\n  A["Line1<br/>Line2"]\n  B["Line1<br>Line2"]\n  C["Line1<br />Line2"]');
  const byId = new Map(ast.nodes.map((n) => [n.id, n.label]));
  assert.equal(byId.get('A'), 'Line1 Line2');
  assert.equal(byId.get('B'), 'Line1 Line2');
  assert.equal(byId.get('C'), 'Line1 Line2');
});

test('Mermaid entity codes are decoded (numeric and the documented named ones)', () => {
  const { ast } = parseMermaid('graph TD\n  A["I #9829; Mermaid"]\n  B["#quot;quoted#quot;"]');
  const byId = new Map(ast.nodes.map((n) => [n.id, n.label]));
  assert.equal(byId.get('A'), 'I ♥ Mermaid');
  assert.equal(byId.get('B'), '"quoted"');
});

test('a backtick-delimited Markdown string has its delimiters and emphasis markers stripped, not shown literally', () => {
  const { ast } = parseMermaid('graph TD\n  A["`**bold** and _italic_`"]');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.label, 'bold and italic');
});

test('<br/> also produces a real break token in labelRuns, not just a flattened space', () => {
  const { ast } = parseMermaid('graph TD\n  A["Line1<br/>Line2"]');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.deepEqual(a.labelRuns, [{ text: 'Line1' }, { break: true }, { text: 'Line2' }]);
});

test('a Markdown string\'s bold/italic spans become real LabelRun tokens, not just stripped plain text', () => {
  const { ast } = parseMermaid('graph TD\n  A["`**bold** and _italic_ and plain`"]');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.deepEqual(a.labelRuns, [
    { text: 'bold', bold: true },
    { text: ' and ' },
    { text: 'italic', italic: true },
    { text: ' and plain' },
  ]);
});

test('emphasis markers are only interpreted inside a backtick Markdown string — a literal ** in an ordinary label stays literal', () => {
  const { ast } = parseMermaid('graph TD\n  A[No **markup** here]');
  const a = ast.nodes.find((n) => n.id === 'A')!;
  assert.equal(a.label, 'No **markup** here');
  assert.deepEqual(a.labelRuns, [{ text: 'No **markup** here' }]);
});

test('an edge label also gets structured labelRuns alongside its flattened plain label', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|"`**Yes**`"| B');
  assert.equal(ast.edges[0]!.label, 'Yes');
  assert.deepEqual(ast.edges[0]!.labelRuns, [{ text: 'Yes', bold: true }]);
});

test('an edge with no label has null labelRuns, mirroring its null label', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B');
  assert.equal(ast.edges[0]!.label, null);
  assert.equal(ast.edges[0]!.labelRuns, null);
});

test('warns on unclosed subgraph', () => {
  const { warnings } = parseMermaid('graph TD\n  subgraph S1\n    A --> B');
  assert.ok(warnings.some((w) => w.includes('Unclosed')));
});

test('does not duplicate a subgraph id as a node (Dagre crash fix)', () => {
  // Mermaid allows edges between subgraphs (`U1 --> Y2`). The subgraph id must
  // not also be registered as a plain node, or Dagre crashes (an id cannot be
  // both a node and a cluster).
  const { ast, warnings } = parseMermaid(
    'graph TD\n  subgraph U1\n    A --> B\n  end\n  subgraph Y2\n    C --> D\n  end\n  U1 --> Y2',
  );
  const nodeIds = ast.nodes.map((n) => n.id);
  assert.ok(!nodeIds.includes('U1'), 'U1 must not be a node');
  assert.ok(!nodeIds.includes('Y2'), 'Y2 must not be a node');
  // The inter-subgraph edge is dropped with a warning (V1 limitation).
  assert.ok(!ast.edges.some((e) => e.from === 'U1' || e.to === 'Y2'));
  assert.ok(warnings.some((w) => w.includes('references a subgraph')));
});

test('records nested subgraph relationships in subgraphIds', () => {
  const { ast } = parseMermaid(
    'graph TD\n  subgraph Outer[Out]\n    A --> B\n    subgraph Inner[In]\n      C --> D\n    end\n    B --> C\n  end',
  );
  const outer = ast.subgraphs.find((s) => s.id === 'Outer')!;
  const inner = ast.subgraphs.find((s) => s.id === 'Inner')!;
  assert.deepEqual(outer.subgraphIds, ['Inner']);
  assert.deepEqual(inner.subgraphIds, []);
});

test('a subgraph\'s own nested direction statement is parsed into Subgraph.direction, not silently dropped', () => {
  // Regression (rich-text runs follow-up, punch list item 4, 2026-09-04):
  // `direction LR` inside a subgraph used to fall through to the generic
  // "Unsupported line ignored" warning. It's now recognized (though still
  // not applied to layout — see types.ts's Subgraph.direction doc comment).
  const { ast, warnings } = parseMermaid('graph TD\n  subgraph S1\n    direction LR\n    A --> B\n  end');
  const sg = ast.subgraphs.find((s) => s.id === 'S1')!;
  assert.equal(sg.direction, 'LR');
  assert.ok(!warnings.some((w) => w.includes('Unsupported line ignored')));
  assert.ok(warnings.some((w) => w.includes('S1') && w.includes('LR')));
});

test('a subgraph direction of TB normalizes to TD, same alias as the top-level header', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1\n    direction TB\n    A --> B\n  end');
  assert.equal(ast.subgraphs.find((s) => s.id === 'S1')!.direction, 'TD');
});

test('a subgraph with no direction statement leaves Subgraph.direction undefined', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1\n    A --> B\n  end');
  assert.equal(ast.subgraphs.find((s) => s.id === 'S1')!.direction, undefined);
});

test('nested subgraphs can each declare their own independent direction', () => {
  const { ast } = parseMermaid(
    'graph TD\n  subgraph Outer\n    direction RL\n    A --> B\n    subgraph Inner\n      direction BT\n      C --> D\n    end\n  end',
  );
  assert.equal(ast.subgraphs.find((s) => s.id === 'Outer')!.direction, 'RL');
  assert.equal(ast.subgraphs.find((s) => s.id === 'Inner')!.direction, 'BT');
});

test('a bare "direction LR" outside any subgraph is not valid syntax and still warns generically', () => {
  const { warnings } = parseMermaid('graph TD\n  direction LR\n  A --> B');
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored: direction LR')));
});

test('a node stays attached to the subgraph where it was first declared, not a later enclosing one', () => {
  // Regression: `B --> C` here runs AFTER Inner's `end`, back inside Outer.
  // C was already declared inside Inner and must not be re-attached to
  // Outer just because a later line mentions it from an outer scope.
  const { ast } = parseMermaid(
    'graph TD\n  subgraph Outer[Out]\n    A --> B\n    subgraph Inner[In]\n      C --> D\n    end\n    B --> C\n  end',
  );
  const outer = ast.subgraphs.find((s) => s.id === 'Outer')!;
  const inner = ast.subgraphs.find((s) => s.id === 'Inner')!;
  assert.deepEqual(outer.nodeIds, ['A', 'B']);
  assert.deepEqual(inner.nodeIds, ['C', 'D']);
});

test('joins a node label that wraps across a raw newline instead of dropping the statement', () => {
  // Regression (medium-realistic.mmd, 2026-09-04): Mermaid treats a literal
  // newline inside `{}`/`[]`/`()` as part of the label. A line-based parser
  // that doesn't merge the continuation sees two broken statements, warns on
  // both, and drops the edge — disconnecting the diagram.
  const { ast, warnings } = parseMermaid(
    'graph TD\n  Lire --> Valider{Config\n valide?}:::gate\n  Valider -->|oui| Next',
  );
  const valider = ast.nodes.find((n) => n.id === 'Valider');
  assert.ok(valider, 'Valider node must exist');
  assert.equal(valider!.label, 'Config valide?');
  assert.equal(valider!.shape, 'diamond');
  assert.equal(ast.edges.length, 2);
  assert.ok(ast.edges.some((e) => e.from === 'Lire' && e.to === 'Valider'));
  assert.ok(ast.edges.some((e) => e.from === 'Valider' && e.to === 'Next'));
  assert.ok(!warnings.some((w) => w.includes('Unsupported line ignored')));
});
