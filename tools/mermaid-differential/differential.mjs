#!/usr/bin/env node
/**
 * Stage 2 of the Mermaid conformance work (TODO §2, "Conformité Mermaid"): for every official example
 * (`test-corpus/mermaid-official/examples.json`), compare what Mermaid itself understood to what this
 * project's parser understood. Stage 1 only sees warnings; this sees a node, a link or a message that
 * one side has and the other does not, even when no warning was raised.
 *
 *   npm ci --prefix tools/mermaid-differential
 *   npm run build -w packages/core
 *   node tools/mermaid-differential/differential.mjs [--report] [--write-baseline] [--check] [--page <name>] [--verbose]
 *
 * Mermaid's side comes from its public API, `mermaid.mermaidAPI.getDiagramFromText()`, which parses into
 * the diagram's database without rendering. Mermaid needs a DOM even to parse (its text sanitizer), hence
 * jsdom (docs/adr/spikes/spike-gantt-parser/spike.md, Finding 2). Both are dev tools of this folder only,
 * never a dependency of a published package (maintainer decision 2026-11-19).
 *
 * Our side goes through the same steps as `renderDiagram()`: `detectDiagramType`, `prepareSource`, then the
 * type's parser.
 *
 * Per example, one status:
 *   - `match`     : same facts on both sides (see the comparators below for what counts);
 *   - `diff`      : at least one fact differs, listed;
 *   - `mermaid-rejects`: Mermaid itself throws on the example (a doc example for a newer syntax, say);
 *   - `not-compared`: a type with no comparator yet.
 * `--report` rewrites `test-corpus/mermaid-official/DIFFERENTIAL.md`; `--write-baseline` rewrites
 * `expected-match.json`; `--check` exits 1 when an example listed there no longer matches (CI lock).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

// Mermaid's Gantt dates are local time (dayjs), ours are UTC by design (`gantt/date-utils.ts`): compare both
// in UTC. Set before Mermaid is loaded and before any date is made.
process.env.TZ = 'UTC';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const corpusDir = join(root, 'test-corpus', 'mermaid-official');
const core = (path) => import(pathToFileURL(join(root, 'packages', 'core', 'dist', path)).href);

const args = process.argv.slice(2);
const onlyPage = args.includes('--page') ? args[args.indexOf('--page') + 1] : undefined;
const verbose = args.includes('--verbose');

// --- Mermaid, in a minimal DOM --------------------------------------------------------------------------

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'SVGElement', 'DOMParser', 'MutationObserver', 'Option']) {
  if (!(key in globalThis)) {
    Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true, writable: true });
  }
}
const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const mermaidVersion = JSON.parse(readFileSync(join(here, 'node_modules', 'mermaid', 'package.json'), 'utf8')).version;

// --- Our parsers -----------------------------------------------------------------------------------------

const { detectDiagramType } = await core('parser/diagram-type.js');
const { prepareSource } = await core('parser/frontmatter.js');
const { parseMermaid } = await core('parser/index.js');
const { parseSequence } = await core('diagrams/sequence/parser.js');
const { parseClassDiagram } = await core('diagrams/class-diagram/parser.js');
const { parseStateDiagram } = await core('diagrams/state-diagram/parser.js');
const { parseErDiagram } = await core('diagrams/er-diagram/parser.js');
const { parseGanttChart } = await core('diagrams/gantt/parser.js');
const { parseMindmap } = await core('diagrams/mindmap/parser.js');
const { parseRequirementDiagram } = await core('diagrams/requirement-diagram/parser.js');
const { parseTreeView } = await core('diagrams/tree-view/parser.js');
const { parseC4Diagram } = await core('diagrams/c4/parser.js');
const { withImplicitRoot } = await core('diagrams/tree-view/implicit-root.js');
const { parseLabel } = await core('parser/label.js');
const { extractNodeStyle, parseCssStyleProps, parseHexColor } = await core('parser/css-style.js');

/** A style as one comparable string (`fill=FF0000 bold`), or '' when it sets nothing. */
function styleFact({ fill, stroke, color, bold, italic }) {
  return [
    fill !== undefined ? `fill=${fill}` : '',
    stroke !== undefined ? `stroke=${stroke}` : '',
    color !== undefined ? `color=${color}` : '',
    bold !== undefined ? `bold=${bold}` : '',
    italic !== undefined ? `italic=${italic}` : '',
  ]
    .filter((p) => p !== '')
    .join(' ');
}

// --- Text normalization: what both sides would show as the same words -----------------------------------

// HTML entities decoded by the DOM itself, so a named one (`&infin;`) needs no table here.
const decoder = dom.window.document.createElement('textarea');
function decodeEntities(text) {
  decoder.innerHTML = text.replace(/</g, '&lt;');
  return decoder.value;
}

/**
 * Mermaid keeps its own `#name;` / `#123;` entity syntax encoded in the database (`ﬂ°name¶ß`, `ﬂ°°123¶ß`) and
 * decodes it only when it draws. Put it back as HTML entities, which {@link normText} decodes. Only Mermaid's
 * side goes through this: our parser must decode `#name;` itself, and a gap there is a real one.
 */
function mermaidEntities(text) {
  return String(text ?? '').replace(/ﬂ°°(\d+)¶ß/g, '&#$1;').replace(/ﬂ°(\w+)¶ß/g, '&$1;');
}

/** Mermaid's label text as its rendering shows it: tags and Markdown emphasis removed, HTML entities decoded, spaces collapsed. */
export function normText(text, markdown = false) {
  if (text === undefined || text === null) return '';
  let value = String(text).trim();
  // Mermaid reads Markdown only inside a "`…`" string (a flowchart stores it without the backticks and says
  // so with `labelType: 'markdown'`); elsewhere a `*` or `_` is a plain character.
  if (value.length >= 2 && value.startsWith('`') && value.endsWith('`')) {
    value = value.slice(1, -1);
    markdown = true;
  }
  // `_` inside a word is a plain character for `marked` too (CommonMark), so `test_req` keeps its underscore.
  if (markdown) value = value.replace(/\*\*|\*|(?<![\p{L}\p{N}_])__?|__?(?![\p{L}\p{N}_])/gu, '');
  return decodeEntities(value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Our side, as Word will show it: our parser's text goes into the document as it is (escaped), so only
 * spaces are collapsed. An HTML entity or tag left in it is a real gap, not noise: Mermaid's side is
 * reduced to what its rendering shows ({@link normText}), ours is not.
 */
function ourText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// --- Comparators: each returns { ours, theirs }, two lists of comparable fact strings ---------------------

/** Multiset difference: facts in `a` not matched in `b`. */
function minus(a, b) {
  const left = new Map();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

const COMPARATORS = {
  flowchart: {
    theirs(db) {
      const facts = [];
      const md = (item) => item.labelType === 'markdown';
      // A link to a subgraph (`A --> S`) leaves a vertex `S` in Mermaid's base, which its renderer merges
      // into the cluster and never draws as a node: the cluster is what both sides compare.
      const subgraphIds = new Set(db.getSubGraphs().map((s) => s.id));
      for (const v of db.getVertices().values()) if (!subgraphIds.has(v.id)) facts.push(`node ${v.id} "${normText(mermaidEntities(v.text ?? v.id), md(v))}"`);
      for (const e of db.getEdges()) facts.push(`link ${e.start} -> ${e.end}${e.text ? ` "${normText(mermaidEntities(e.text), md(e))}"` : ''}`);
      for (const s of db.getSubGraphs()) facts.push(`subgraph ${s.id} "${normText(mermaidEntities(s.title), md(s))}" [${[...s.nodes].sort().join(' ')}]`);
      return facts;
    },
    ours(source) {
      const { ast } = parseMermaid(source);
      const facts = [];
      for (const n of ast.nodes) facts.push(`node ${n.id} "${ourText(n.label)}"`);
      for (const e of ast.edges) facts.push(`link ${e.from} -> ${e.to}${e.label ? ` "${ourText(e.label)}"` : ''}`);
      for (const s of ast.subgraphs) facts.push(`subgraph ${s.id} "${ourText(s.title)}" [${[...s.nodeIds, ...s.subgraphIds].sort().join(' ')}]`);
      return facts;
    },
  },
  sequence: {
    theirs(db) {
      const name = Object.fromEntries(Object.entries(db.LINETYPE).map(([k, v]) => [v, k]));
      const facts = [...db.getActors().values()].map((a) => `participant ${a.name} "${normText(mermaidEntities(a.description ?? a.name))}"`);
      for (const m of db.getMessages()) {
        const kind = name[m.type] ?? String(m.type);
        if (kind === 'NOTE') facts.push(`note "${normText(mermaidEntities(m.message))}"`);
        else if (/^ACTIVE_|^AUTONUMBER$|^CENTRAL_CONNECTION/.test(kind)) continue;
        // A `rect` block's text is its colour, which our side keeps as a colour, not a label.
        else if (kind === 'RECT_START') facts.push('block rect');
        else if (/_START$/.test(kind)) facts.push(`block ${kind.replace(/_START$/, '').replace('PAR_OVER', 'PAR').toLowerCase()} "${normText(mermaidEntities(m.message))}"`);
        else if (/_(ELSE|AND|OPTION)$/.test(kind)) facts.push(`else "${normText(mermaidEntities(m.message))}"`);
        else if (/_END$/.test(kind)) facts.push('end');
        else facts.push(`message ${m.from} -> ${m.to} "${normText(mermaidEntities(m.message))}"`);
      }
      return facts;
    },
    ours(source) {
      const { ast } = parseSequence(source);
      const facts = ast.participants.map((p) => `participant ${p.id} "${ourText(p.label)}"`);
      for (const item of ast.items) {
        if (item.type === 'message') facts.push(`message ${item.from} -> ${item.to} "${ourText(item.text)}"`);
        else if (item.type === 'note') facts.push(`note "${ourText(item.text)}"`);
        else if (item.type === 'blockStart') facts.push(item.kind === 'rect' ? 'block rect' : `block ${item.kind} "${ourText(item.label)}"`);
        else if (item.type === 'blockElse') facts.push(`else "${ourText(item.label)}"`);
        else if (item.type === 'blockEnd') facts.push('end');
      }
      return facts;
    },
  },
  class: {
    theirs(db) {
      const facts = [...db.getClasses().values()].map(
        (c) => `class ${c.id} "${normText(mermaidEntities(c.label))}" ${c.members.length}a ${c.methods.length}m <<${c.annotations.join(',')}>>`,
      );
      // Mermaid's relation end codes (classDb's relationType), type1 on id1's side, type2 on id2's.
      const end = { 0: 'aggregation', 1: 'triangle', 2: 'composition', 3: 'arrow', 4: 'lollipop' };
      for (const r of db.getRelations()) {
        const { type1, type2, lineType } = r.relation;
        const card = (t) => (t === undefined || t === 'none' ? '-' : normText(mermaidEntities(t)));
        facts.push(`relation ${r.id1} ${end[type1] ?? 'none'} ${lineType === 1 ? '..' : '--'} ${end[type2] ?? 'none'} ${r.id2} [${card(r.relationTitle1)} ${card(r.relationTitle2)}]`);
      }
      for (const note of db.getNotes().values()) facts.push(`note for ${note.class ?? '-'}`);
      for (const ns of db.getNamespaces().values()) {
        facts.push(`namespace ${ns.id} "${normText(mermaidEntities(ns.label))}" in ${ns.parent ?? '-'} [${[...ns.classes.keys()].sort().join(' ')}]`);
      }
      return facts;
    },
    ours(source) {
      const { ast } = parseClassDiagram(source);
      const facts = ast.classes.map((c) => `class ${c.id} "${ourText(c.label)}" ${c.attributes.length}a ${c.methods.length}m <<${(c.annotations ?? []).join(',')}>>`);
      const kind = { inheritance: 'triangle', realization: 'triangle', composition: 'composition', aggregation: 'aggregation', association: 'arrow', dependency: 'arrow', lollipop: 'lollipop' };
      const dotted = new Set(['realization', 'dependency', 'dashedLink']);
      for (const r of ast.relationships) {
        const atFrom = r.markerEnd === 'from' || r.markerEnd === 'both' ? (kind[r.type] ?? 'none') : 'none';
        const atTo = r.markerEnd === 'to' || r.markerEnd === 'both' ? (kind[r.type] ?? 'none') : 'none';
        facts.push(`relation ${r.from} ${atFrom} ${dotted.has(r.type) ? '..' : '--'} ${atTo} ${r.to} [${r.fromCardinality ? ourText(r.fromCardinality) : '-'} ${r.toCardinality ? ourText(r.toCardinality) : '-'}]`);
      }
      for (const note of ast.notes ?? []) facts.push(`note for ${note.for ?? '-'}`);
      for (const ns of ast.namespaces ?? []) {
        const members = ast.classes.filter((c) => c.namespace === ns.id).map((c) => c.id);
        facts.push(`namespace ${ns.id} "${ourText(ns.label)}" in ${ns.parent ?? '-'} [${members.sort().join(' ')}]`);
      }
      return facts;
    },
  },
  state: {
    theirs(db) {
      const { nodes, edges } = db.getData();
      const pseudo = new Map(nodes.filter((n) => n.shape === 'stateStart' || n.shape === 'stateEnd').map((n) => [n.id, n.shape === 'stateStart' ? '(start)' : '(end)']));
      // Notes and the regions of a concurrent state (`--`) are layout nodes in Mermaid's data, not states.
      const layoutOnly = new Set(nodes.filter((n) => ['note', 'noteGroup', 'divider'].includes(n.shape)).map((n) => n.id));
      // A region (`divider`) has a generated id: named by its composite and its rank among that composite's regions.
      const regionName = new Map();
      for (const n of nodes.filter((d) => d.shape === 'divider')) {
        const rank = [...regionName.values()].filter((v) => v.endsWith(` of ${n.parentId}`)).length;
        regionName.set(n.id, `region ${rank} of ${n.parentId}`);
      }
      const where = (n) => (n.parentId === undefined ? '' : ` in ${regionName.get(n.parentId) ?? n.parentId}`);
      const facts = nodes.filter((n) => !pseudo.has(n.id) && !layoutOnly.has(n.id)).map((n) => `state ${n.id}${where(n)}`);
      for (const n of nodes.filter((p) => pseudo.has(p.id))) facts.push(`${pseudo.get(n.id)}${where(n)}`);
      // Styles: the classes in order, then `style`, read through our own CSS reader, so only the layering is compared.
      for (const n of nodes.filter((p) => !pseudo.has(p.id) && !layoutOnly.has(p.id))) {
        const fact = styleFact(extractNodeStyle(parseCssStyleProps([...(n.cssCompiledStyles ?? []), ...(n.cssStyles ?? [])].join(','))));
        if (fact) facts.push(`style ${n.id} ${fact}`);
      }
      // A note is a `note` node joined to its state by an edge, either way round.
      for (const n of nodes.filter((p) => p.shape === 'note')) {
        const link = edges.find((e) => e.start === n.id || e.end === n.id);
        const target = link ? (link.start === n.id ? link.end : link.start) : '-';
        facts.push(`note ${String(n.position).replace(/ of$/, '')} of ${target} "${normText(mermaidEntities(n.label))}"`);
      }
      for (const e of edges) {
        if (layoutOnly.has(e.start) || layoutOnly.has(e.end)) continue;
        facts.push(`transition ${pseudo.get(e.start) ?? e.start} -> ${pseudo.get(e.end) ?? e.end}${e.label ? ` "${normText(mermaidEntities(e.label))}"` : ''}`);
      }
      return facts;
    },
    ours(source) {
      const { ast } = parseStateDiagram(source);
      const pseudo = new Map(ast.states.filter((s) => s.kind === 'start' || s.kind === 'end').map((s) => [s.id, `(${s.kind})`]));
      const regionName = new Map();
      for (const r of ast.regions ?? []) {
        const rank = [...regionName.values()].filter((v) => v.endsWith(` of ${r.parent}`)).length;
        regionName.set(r.id, `region ${rank} of ${r.parent}`);
      }
      const where = (s) => (s.parent === undefined ? '' : ` in ${regionName.get(s.parent) ?? s.parent}`);
      const facts = ast.states.filter((s) => !pseudo.has(s.id)).map((s) => `state ${s.id}${where(s)}`);
      for (const s of ast.states.filter((p) => pseudo.has(p.id))) facts.push(`${pseudo.get(s.id)}${where(s)}`);
      for (const s of ast.states.filter((p) => !pseudo.has(p.id))) {
        const fact = styleFact({ fill: s.fill, stroke: s.stroke, color: s.textColor, bold: s.bold, italic: s.italic });
        if (fact) facts.push(`style ${s.id} ${fact}`);
      }
      for (const note of ast.notes ?? []) facts.push(`note ${note.side} of ${note.for} "${ourText(note.lines.join(' '))}"`);
      for (const t of ast.transitions) facts.push(`transition ${pseudo.get(t.from) ?? t.from} -> ${pseudo.get(t.to) ?? t.to}${t.label ? ` "${ourText(t.label)}"` : ''}`);
      return facts;
    },
  },
  er: {
    theirs(db) {
      // A relationship naming a group also creates an entity of that name in Mermaid's db; its renderer
      // (`getData`) skips every entity whose name is a group's id, so only the group is drawn.
      const groups = db.getSubGraphs();
      const groupIds = new Set(groups.map((g) => g.id));
      const entities = [...db.getEntities().entries()];
      const byInternalId = new Map(entities.map(([name, e]) => [e.id, name]));
      const facts = entities
        .filter(([name]) => !groupIds.has(name))
        .map(([name, e]) => `entity ${name} "${normText(mermaidEntities(e.alias || name))}" ${e.attributes.length} attributes`);
      const direction = (d) => (d === undefined ? '-' : d === 'TB' ? 'TD' : d);
      for (const g of groups) facts.push(`group ${g.id} "${normText(mermaidEntities(g.title))}" ${direction(g.dir)} [${[...g.nodes].sort().join(' ')}]`);
      // Mermaid's relSpec names the cardinalities oddly: cardB sits next to entityA, cardA next to entityB.
      const card = { ZERO_OR_ONE: 'zero-or-one', ONLY_ONE: 'exactly-one', ZERO_OR_MORE: 'zero-or-many', ONE_OR_MORE: 'one-or-many' };
      for (const r of db.getRelationships()) {
        const kind = `${card[r.relSpec.cardB] ?? r.relSpec.cardB} ${r.relSpec.relType === 'IDENTIFYING' ? '--' : '..'} ${card[r.relSpec.cardA] ?? r.relSpec.cardA}`;
        facts.push(`relation ${byInternalId.get(r.entityA) ?? r.entityA} ${kind} ${byInternalId.get(r.entityB) ?? r.entityB} "${normText(mermaidEntities(r.roleA))}"`);
      }
      return facts;
    },
    ours(source) {
      const { ast } = parseErDiagram(source);
      const facts = ast.entities.map((e) => `entity ${e.id} "${ourText(e.label ?? e.id)}" ${e.attributes.length} attributes`);
      for (const g of ast.groups ?? []) {
        const members = [...ast.entities.filter((e) => e.group === g.id).map((e) => e.id), ...(ast.groups ?? []).filter((c) => c.parent === g.id).map((c) => c.id)];
        facts.push(`group ${g.id} "${ourText(g.label)}" ${g.direction ?? '-'} [${members.sort().join(' ')}]`);
      }
      for (const r of ast.relationships) {
        facts.push(`relation ${r.from} ${r.fromCardinality} ${r.identifying ? '--' : '..'} ${r.toCardinality} ${r.to} "${ourText(r.label)}"`);
      }
      return facts;
    },
  },
  gantt: {
    theirs(db) {
      // `getTasks()` resolves the dates (the parse alone only records the task lines). A `dateFormat` with no
      // date in it (`HH:mm`) puts the times on today for dayjs, on 1970-01-01 for us (determinism, parser.ts):
      // Mermaid's dates are brought back to 1970-01-01 for the comparison.
      const dateFormat = db.getDateFormat().trim() || 'YYYY-MM-DD';
      const timeOnly = !/[YDM]/.test(dateFormat) && !/^[xX]$/.test(dateFormat);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const iso = (date) => new Date(date.getTime() - (timeOnly ? today.getTime() : 0)).toISOString();
      return db.getTasks().map((t) => {
        // Mermaid reads a trailing `%%` comment in a task's data as part of its end, which then is no duration
        // and gives the task none; we ignore the comment (parser.ts). The end of such a task is not compared.
        const end = String(t.raw?.endTime?.data ?? '').includes('%%') ? '(commented)' : iso(t.endTime);
        const tags = ['active', 'done', 'crit', 'milestone', 'vert'].filter((k) => t[k]);
        return ganttFact(t.id, normText(mermaidEntities(t.task)), t.section, iso(t.startTime), end, tags);
      });
    },
    ours(source) {
      const { ast } = parseGanttChart(source);
      const commented = new Set(
        source
          .split('\n')
          .filter((l) => !l.trim().startsWith('%%') && /:.*%%/.test(l))
          .map((l) => l.slice(0, l.indexOf(':')).trim()),
      );
      return ast.tasks.map((t) => ganttFact(t.id, ourText(t.text), t.section ?? '', t.start.toISOString(), commented.has(t.text) ? '(commented)' : t.end.toISOString(), t.tags));
    },
  },
};

// Mermaid's `nodeType` numbers (mindmapDb.ts), named as our `MindmapShape`.
const MINDMAP_SHAPES = ['default', 'rounded', 'square', 'circle', 'cloud', 'bang', 'hexagon'];

/**
 * A mindmap as facts, one per node in tree order: its place (its index and its parent's), shape, text and
 * decorations. Ids are not compared: an unshaped node's id is its text for Mermaid, a generated one for us.
 */
function mindmapFacts(root, fact) {
  const facts = [];
  const walk = (node, parent) => {
    const index = facts.length;
    facts.push(fact(node, index, parent));
    for (const child of node.children) walk(child, index);
  };
  if (root) walk(root, '-');
  return facts;
}

function mindmapFact(index, parent, shape, text, icon, className) {
  return `node ${index} under ${parent} ${shape} "${text}" icon="${icon ?? ''}" class="${className ?? ''}"`;
}

COMPARATORS.mindmap = {
  // Every mindmap label is Markdown for Mermaid (`labelType: 'markdown'`), backticks or not.
  theirs: (db) =>
    mindmapFacts(db.getMindmap(), (n, i, parent) =>
      mindmapFact(i, parent, MINDMAP_SHAPES[n.type] ?? `type${n.type}`, normText(mermaidEntities(n.descr), true), n.icon, n.class),
    ),
  ours(source) {
    const { ast } = parseMindmap(source);
    return mindmapFacts(ast.root, (n, i, parent) => mindmapFact(i, parent, n.shape, ourText(n.label), n.icon, n.className));
  },
};

// Mermaid's db stores each requirement type as it displays it (`requirementDb.ts`), ours the keyword.
const REQUIREMENT_TYPE_DISPLAY = {
  requirement: 'Requirement',
  functionalRequirement: 'Functional Requirement',
  interfaceRequirement: 'Interface Requirement',
  performanceRequirement: 'Performance Requirement',
  physicalRequirement: 'Physical Requirement',
  designConstraint: 'Design Constraint',
};

/**
 * A requirement diagram as facts: each box with its fields as the box shows them (Mermaid reads every line of
 * a box as Markdown when it draws it; our translator reads ours the same way, `parseLabel`), each
 * relationship, the direction, and each box's resolved style.
 */
COMPARATORS.requirement = {
  theirs(db) {
    const md = (text) => normText(mermaidEntities(text), true);
    const facts = [`direction ${db.getDirection() === 'TB' ? 'TD' : db.getDirection()}`];
    const classes = db.getClasses();
    const style = (node) => {
      // Class styles in the order the node got its classes (`default` first), then its own inline list, which
      // `requirementDb.ts` fills in statement order.
      const classStyles = node.classes.flatMap((c) => classes.get(c)?.styles ?? []);
      const fact = styleFact(extractNodeStyle(parseCssStyleProps([...classStyles, ...node.cssStyles].join(','))));
      if (fact) facts.push(`style ${node.name} ${fact}`);
    };
    for (const r of db.getRequirements().values()) {
      facts.push(`requirement "${md(r.name)}" «${r.type}» id="${md(r.requirementId)}" text="${md(r.text)}" risk="${r.risk}" verify="${r.verifyMethod}"`);
      style(r);
    }
    for (const e of db.getElements().values()) {
      facts.push(`element "${md(e.name)}" type="${md(e.type)}" docref="${md(e.docRef)}"`);
      style(e);
    }
    for (const rel of db.getRelationships()) facts.push(`relationship ${rel.src} ${rel.type} ${rel.dst}`);
    return facts;
  },
  ours(source) {
    const { ast } = parseRequirementDiagram(source);
    const md = (text) => ourText(text === undefined ? '' : parseLabel(text, { markdown: true }).text);
    const facts = [`direction ${ast.direction ?? 'TD'}`];
    const style = (box) => {
      const fact = styleFact({ fill: box.fill, stroke: box.stroke, color: box.textColor, bold: box.bold, italic: box.italic });
      if (fact) facts.push(`style ${box.name} ${fact}`);
    };
    for (const r of ast.requirements) {
      facts.push(`requirement "${md(r.name)}" «${REQUIREMENT_TYPE_DISPLAY[r.type] ?? r.type}» id="${md(r.id)}" text="${md(r.text)}" risk="${r.risk ?? ''}" verify="${r.verifyMethod ?? ''}"`);
      style(r);
    }
    for (const e of ast.elements) {
      facts.push(`element "${md(e.name)}" type="${md(e.type)}" docref="${md(e.docRef)}"`);
      style(e);
    }
    for (const rel of ast.relationships) facts.push(`relationship ${rel.from} ${rel.type} ${rel.to}`);
    return facts;
  },
};

/** One tree view row as a comparable fact: its place, kind, name as shown, and annotations. */
function treeViewFact(index, parent, kind, name, className, icon, description) {
  return `node ${index} under ${parent} ${kind} "${name}" class="${className ?? ''}" icon="${icon ?? ''}" desc="${description ?? ''}"`;
}

/**
 * A tree view as facts: each row in tree order, Mermaid's implicit `/` root first (its db starts with it;
 * we add it when drawing, `withImplicitRoot`), then the title and accessibility texts.
 */
COMPARATORS.treeView = {
  theirs(db) {
    const facts = [];
    const walk = (node, parent) => {
      const index = facts.length;
      facts.push(treeViewFact(index, parent, node.nodeType === 'directory' ? 'dir' : 'file', node.name, node.cssClass, node.icon, node.description));
      for (const child of node.children) walk(child, index);
    };
    walk(db.getRoot(), '-');
    for (const [key, value] of [['title', db.getDiagramTitle()], ['accTitle', db.getAccTitle()], ['accDescr', db.getAccDescription()]]) {
      if (value) facts.push(`${key} "${value}"`);
    }
    return facts;
  },
  ours(source) {
    const { ast } = parseTreeView(source);
    const facts = withImplicitRoot(ast).map((n, i) =>
      treeViewFact(i, n.parent < 0 ? '-' : n.parent, n.isDirectory ? 'dir' : 'file', n.label, n.className, n.icon, n.description),
    );
    for (const key of ['title', 'accTitle', 'accDescr']) if (ast[key]) facts.push(`${key} "${ast[key]}"`);
    return facts;
  },
};

/** A C4 colour as both sides compare it: our hex, or Mermaid's raw value when it is not one we read. */
const c4Color = (value) => (value === undefined || value === null || value === '' ? '' : (parseHexColor(String(value)) ?? String(value)));

/** A C4 style (element, frame or relationship) as one fact, or none when nothing is set. */
function c4StyleFact(kind, id, parts) {
  const set = Object.entries(parts).filter(([, v]) => v !== '' && v !== undefined);
  return set.length ? [`${kind} ${id} ${set.map(([k, v]) => `${k}=${v}`).join(' ')}`] : [];
}

/**
 * A C4 diagram as facts: the header, the layout config, each element (Mermaid's shape type, texts, frame),
 * each frame (boundary or deployment node, texts, enclosing frame), each relationship in Mermaid's sense
 * (a `Rel_Back` points at its first argument), and every style the `Update*` directives set.
 */
COMPARATORS.c4 = {
  theirs(db) {
    const t = (field) => normText(mermaidEntities(field?.text ?? ''));
    const parent = (p) => (!p || p === 'global' ? '-' : p);
    const facts = [`level ${db.getC4Type()}`, `layout ${db.getC4ShapeInRow()} ${db.getC4BoundaryInRow()}`];
    for (const e of db.getC4ShapeArray()) {
      facts.push(`element ${e.alias} ${e.typeC4Shape.text} "${t(e.label)}" techn="${t(e.techn)}" descr="${t(e.descr)}" in ${parent(e.parentBoundary)}`);
      facts.push(...c4StyleFact('style', e.alias, { fill: c4Color(e.bgColor), line: c4Color(e.borderColor), text: c4Color(e.fontColor) }));
    }
    for (const b of db.getBoundaries()) {
      if (b.alias === 'global') continue;
      facts.push(`frame ${b.alias} ${b.nodeType ? 'deployment' : 'boundary'} "${t(b.label)}" type="${t(b.type)}" descr="${t(b.descr)}" in ${parent(b.parentBoundary)}`);
      facts.push(...c4StyleFact('style', b.alias, { fill: c4Color(b.bgColor), line: c4Color(b.borderColor), text: c4Color(b.fontColor) }));
    }
    for (const r of db.getRels()) {
      const [from, to] = r.type === 'rel_b' ? [r.to, r.from] : [r.from, r.to];
      facts.push(`rel ${from} -> ${to} "${t(r.label)}" techn="${t(r.techn)}"${r.type === 'birel' ? ' both' : ''}`);
      facts.push(
        ...c4StyleFact('relstyle', `${from}->${to}`, {
          line: c4Color(r.lineColor),
          text: c4Color(r.textColor),
          dx: r.offsetX ? String(r.offsetX) : '',
          dy: r.offsetY ? String(r.offsetY) : '',
        }),
      );
    }
    return facts;
  },
  ours(source) {
    const { ast } = parseC4Diagram(source);
    const level = { context: 'C4Context', container: 'C4Container', component: 'C4Component', dynamic: 'C4Dynamic', deployment: 'C4Deployment' };
    const facts = [`level ${level[ast.level ?? 'context']}`, `layout ${ast.layout?.shapesPerRow ?? 4} ${ast.layout?.boundariesPerRow ?? 2}`];
    for (const e of ast.elements) {
      const type = `${e.external ? 'external_' : ''}${e.category}${e.variant ? `_${e.variant}` : ''}`;
      facts.push(`element ${e.id} ${type} "${ourText(e.label)}" techn="${ourText(e.techn)}" descr="${ourText(e.description)}" in ${e.parent ?? '-'}`);
      facts.push(...c4StyleFact('style', e.id, { fill: e.style?.fill ?? '', line: e.style?.line ?? '', text: e.style?.text ?? '' }));
    }
    for (const b of ast.boundaries ?? []) {
      facts.push(`frame ${b.id} ${b.kind} "${ourText(b.label)}" type="${ourText(b.type)}" descr="${ourText(b.description)}" in ${b.parent ?? '-'}`);
      facts.push(...c4StyleFact('style', b.id, { fill: b.style?.fill ?? '', line: b.style?.line ?? '', text: b.style?.text ?? '' }));
    }
    for (const r of ast.relationships) {
      facts.push(`rel ${r.from} -> ${r.to} "${ourText(r.label)}" techn="${ourText(r.techn)}"${r.bidirectional ? ' both' : ''}`);
      facts.push(
        ...c4StyleFact('relstyle', `${r.from}->${r.to}`, {
          line: r.style?.line ?? '',
          text: r.style?.text ?? '',
          dx: r.style?.offsetX ? String(r.style.offsetX) : '',
          dy: r.style?.offsetY ? String(r.style.offsetY) : '',
        }),
      );
    }
    return facts;
  },
};

/** One Gantt task as a comparable fact: id, text, section, resolved dates, tags. */
function ganttFact(id, text, section, start, end, tags) {
  return `task ${id} "${text}" in "${section}" ${start} -> ${end} [${[...tags].sort().join(' ')}]`;
}

// --- Run ------------------------------------------------------------------------------------------------

const corpus = JSON.parse(readFileSync(join(corpusDir, 'examples.json'), 'utf8'));
const results = [];
for (const [page, examples] of Object.entries(corpus.pages)) {
  if (onlyPage && page !== onlyPage) continue;
  for (const [index, text] of examples.entries()) {
    const id = `${page}#${index}`;
    const { type } = detectDiagramType(text);
    const comparator = COMPARATORS[type];
    if (!comparator) {
      results.push({ id, page, status: 'not-compared', type });
      continue;
    }
    let theirs;
    try {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      theirs = comparator.theirs(diagram.db);
    } catch (error) {
      results.push({ id, page, status: 'mermaid-rejects', type, error: String(error?.message ?? error).split('\n')[0] });
      continue;
    }
    let ours;
    try {
      ours = comparator.ours(prepareSource(text, type).source);
    } catch (error) {
      results.push({ id, page, status: 'diff', type, onlyOurs: [], onlyTheirs: [`our parser threw: ${error?.message ?? error}`] });
      continue;
    }
    const onlyOurs = minus(ours, theirs);
    const onlyTheirs = minus(theirs, ours);
    results.push({ id, page, type, status: onlyOurs.length || onlyTheirs.length ? 'diff' : 'match', onlyOurs, onlyTheirs });
  }
}

const count = (status, list = results) => list.filter((r) => r.status === status).length;
const compared = results.filter((r) => r.status === 'match' || r.status === 'diff');
console.log(`mermaid@${mermaidVersion}: ${results.length} examples, ${compared.length} compared — ${count('match')} match, ${count('diff')} differ, ${count('mermaid-rejects')} rejected by Mermaid, ${count('not-compared')} without a comparator yet.`);
if (verbose) {
  for (const r of results.filter((x) => x.status === 'diff')) {
    console.log(`\n${r.id}`);
    for (const f of r.onlyTheirs) console.log(`  Mermaid only: ${f}`);
    for (const f of r.onlyOurs) console.log(`  ours only:    ${f}`);
  }
}

const baselinePath = join(corpusDir, 'expected-match.json');
if (args.includes('--write-baseline')) {
  writeFileSync(baselinePath, `${JSON.stringify({ mermaid: mermaidVersion, match: results.filter((r) => r.status === 'match').map((r) => r.id) }, null, 1)}\n`);
}

if (args.includes('--report')) {
  const pages = [...new Set(compared.map((r) => r.page))];
  const rows = pages.map((p) => {
    const list = results.filter((r) => r.page === p);
    return `| ${p} | ${list.length} | ${count('match', list)} | ${count('diff', list)} | ${count('mermaid-rejects', list)} |`;
  });
  // Stage 1 calls these examples clean: we draw something else than Mermaid without warning anyone.
  const stage1Clean = new Set(JSON.parse(readFileSync(join(corpusDir, 'expected-clean.json'), 'utf8')).clean);
  const silent = results.filter((r) => r.status === 'diff' && stage1Clean.has(r.id));
  const details = results
    .filter((r) => r.status === 'diff')
    .map((r) => [`### ${r.id}${stage1Clean.has(r.id) ? ' — sans avertissement' : ''}`, '', ...r.onlyTheirs.map((f) => `- Mermaid seulement : \`${f}\``), ...r.onlyOurs.map((f) => `- nous seulement : \`${f}\``), ''].join('\n'));
  const rejectedList = results.filter((r) => r.status === 'mermaid-rejects');
  const rejected = rejectedList.length ? ` (${rejectedList.map((r) => `\`${r.id}\` : ${r.error}`).join(' ; ')})` : '';
  const report = `# Conformité aux exemples officiels de Mermaid (étage 2, différentiel)

Généré par \`node tools/mermaid-differential/differential.mjs --report\` avec \`mermaid@${mermaidVersion}\` : pour chaque
exemple de \`examples.json\`, ce que Mermaid a compris (sa base après analyse, sans rendu) comparé à ce que notre
analyseur a compris. Un écart est un nœud, un lien, un message ou un bloc qu'un seul des deux côtés voit, même
sans avertissement. Exemples © les auteurs de Mermaid, licence MIT (\`LICENSE\` dans ce dossier).

**${compared.length} exemples comparés : ${count('match')} identiques, ${count('diff')} avec écart, dont ${silent.length} sans avertissement** (l'étage 1 les
compte comme propres : nous dessinons autre chose que Mermaid sans le dire, à corriger en premier :
${silent.map((r) => `\`${r.id}\``).join(', ') || 'aucun'}). Hors comparaison : ${count('mermaid-rejects')} refusé(s) par Mermaid lui-même${rejected},
${count('not-compared')} d'un type sans comparateur pour l'instant (organigrammes, séquence, classes, états, ER, Gantt, cartes mentales, exigences, arborescences et C4 en ont un).

| Page | Exemples | Identiques | Écarts | Refusés par Mermaid |
|---|---:|---:|---:|---:|
${rows.join('\n')}

## Écarts

${details.join('\n')}`;
  writeFileSync(join(corpusDir, 'DIFFERENTIAL.md'), report);
}

if (args.includes('--check')) {
  const expected = JSON.parse(readFileSync(baselinePath, 'utf8')).match;
  const byId = new Map(results.map((r) => [r.id, r]));
  const regressions = expected.filter((id) => byId.get(id)?.status !== 'match');
  if (regressions.length) {
    console.error(`\n${regressions.length} example(s) matched Mermaid before and no longer do:`);
    for (const id of regressions) {
      const r = byId.get(id);
      console.error(`\n${id} (${r?.status ?? 'missing'})`);
      for (const f of r?.onlyTheirs ?? []) console.error(`  Mermaid only: ${f}`);
      for (const f of r?.onlyOurs ?? []) console.error(`  ours only:    ${f}`);
    }
    process.exitCode = 1;
  }
}
