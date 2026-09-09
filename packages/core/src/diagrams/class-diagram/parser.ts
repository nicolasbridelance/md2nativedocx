/**
 * Parser for Mermaid `classDiagram` (grammar verified against
 * mermaid.js.org/syntax/classDiagram.html, fetched 2026-09-09). Line-oriented,
 * same forgiving convention as `../../parser/parser.ts` and
 * `../quadrant/parser.ts`: an unrecognized line is skipped with a warning
 * rather than throwing.
 *
 * V1 scope, deliberately:
 * - Class declaration (`class Name`, `class Name["Label"]`, `class Name { ... }`,
 *   backtick-quoted ids) and its member block (colon or bracket member
 *   syntax — kept as raw display text, see `types.ts`).
 * - All 8 relationship arrow families with an optional `: Label` suffix.
 * - `direction TD|TB|LR|BT|RL` (same TB->TD normalization as flowchart).
 *
 * NOT implemented yet, each degrading to "recognized and warned", never
 * silently dropped:
 * - Generics (`List~int~`) — the `~...~` suffix is stripped from the id
 *   with no warning (harmless: the base id is exactly what relationships
 *   reference too), but the generic itself is not displayed.
 * - Annotations (`<<Interface>>`), inline or on their own line outside a
 *   class block, and `namespace` blocks — recognized (a `namespace ... {`
 *   line, or a class body's own `<<...>>` first line) and warned, not
 *   parsed. `namespace` grouping is lost but the `class` declarations
 *   nested inside one are still parsed correctly (see the generic brace
 *   stack below) — only the visual grouping/label is dropped.
 * - `classDef`/`style`/`cssClass` styling and relationship cardinalities
 *   (`"1"`, `"0..1"`, ...) — cardinalities are stripped (quoted segments
 *   removed before relationship matching) with a warning; styling lines are
 *   warned and skipped entirely.
 * - `note`/`note for` — warned and skipped.
 *
 * None of the above affects which classes/members/relationships end up in
 * the AST — only cosmetic extras a first version can safely leave out.
 */

import type { ClassBox, ClassDiagram, ClassMember, ClassRelationType } from './types.js';

export interface ClassDiagramParseResult {
  ast: ClassDiagram;
  warnings: string[];
}

// Longest-prefix-first so e.g. `..|>` doesn't get cut short by `..` or `..>`.
const REL_TOKEN_PATTERN =
  '<\\|--|--\\|>|\\.\\.\\|>|\\|>\\.\\.|\\.\\.>|<\\.\\.|--\\*|\\*--|--o|o--|-->|<--|--|\\.\\.';

const REL_LINE = new RegExp(`^(\\S+)\\s*(${REL_TOKEN_PATTERN})\\s*(\\S+)\\s*(?::\\s*(.+))?$`);

const REL_INFO: Readonly<
  Record<string, { type: ClassRelationType; markerEnd: 'from' | 'to' | 'none' }>
> = {
  '<|--': { type: 'inheritance', markerEnd: 'from' },
  '--|>': { type: 'inheritance', markerEnd: 'to' },
  '*--': { type: 'composition', markerEnd: 'from' },
  '--*': { type: 'composition', markerEnd: 'to' },
  'o--': { type: 'aggregation', markerEnd: 'from' },
  '--o': { type: 'aggregation', markerEnd: 'to' },
  '-->': { type: 'association', markerEnd: 'to' },
  '<--': { type: 'association', markerEnd: 'from' },
  '..>': { type: 'dependency', markerEnd: 'to' },
  '<..': { type: 'dependency', markerEnd: 'from' },
  '..|>': { type: 'realization', markerEnd: 'to' },
  '|>..': { type: 'realization', markerEnd: 'from' },
  '--': { type: 'link', markerEnd: 'none' },
  '..': { type: 'dashedLink', markerEnd: 'none' },
};

const CLASS_HEADER = new RegExp(
  '^class\\s+(?:`([^`]+)`|([A-Za-z_$][\\w$]*))(?:~[^~]*~)?' +
    '(?:\\[(?:"([^"]*)"|([^\\]]*))\\])?\\s*(\\{)?\\s*$',
  'i',
);

function stripQuotedSegments(line: string): { clean: string; hadQuoted: boolean } {
  let hadQuoted = false;
  const clean = line
    .replace(/"[^"]*"/g, () => {
      hadQuoted = true;
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { clean, hadQuoted };
}

function stripIdQuotes(id: string): string {
  return id.replace(/^`|`$/g, '').trim();
}

export function parseClassDiagram(text: string): ClassDiagramParseResult {
  const warnings: string[] = [];
  const classes = new Map<string, ClassBox>();
  const relationships: ClassDiagram['relationships'] = [];
  let direction: ClassDiagram['direction'] = 'TD';

  function getOrCreateClass(id: string): ClassBox {
    let box = classes.get(id);
    if (!box) {
      box = { id, label: id, attributes: [], methods: [] };
      classes.set(id, box);
    }
    return box;
  }

  // Generic brace-nesting stack so a `namespace X { class A { ... } }` still
  // parses `A`'s members correctly even though the namespace grouping itself
  // is dropped (see module doc comment) — only 'class' frames get their
  // lines treated as member declarations.
  type Frame = { kind: 'class'; box: ClassBox } | { kind: 'other' };
  const stack: Frame[] = [];
  let warnedNamespace = false;
  let warnedAnnotation = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^classDiagram\b/i.test(line)) continue;

    const top = stack[stack.length - 1];

    if (line === '}') {
      if (stack.length > 0) stack.pop();
      else warnings.push(`Unexpected "}" without a matching block opener: ${line}`);
      continue;
    }

    if (top?.kind === 'class') {
      if (/^<<.*>>$/.test(line)) {
        if (!warnedAnnotation) {
          warnings.push('Class annotations (e.g. <<Interface>>) are not yet rendered, ignored.');
          warnedAnnotation = true;
        }
        continue;
      }
      const visMatch = line.match(/^([+\-#~])\s*(.+)$/);
      const visibility = visMatch ? (visMatch[1] as ClassMember['visibility']) : undefined;
      const memberText = (visMatch ? visMatch[2] : line)!.trim();
      const member: ClassMember = visibility ? { visibility, text: memberText } : { text: memberText };
      if (memberText.includes('(')) top.box.methods.push(member);
      else top.box.attributes.push(member);
      continue;
    }

    const dirMatch = line.match(/^direction\s+(TD|TB|LR|BT|RL)\b/i);
    if (dirMatch) {
      const requested = dirMatch[1]!.toUpperCase();
      direction = requested === 'TB' ? 'TD' : (requested as ClassDiagram['direction']);
      continue;
    }

    const classMatch = line.match(CLASS_HEADER);
    if (classMatch) {
      const id = stripIdQuotes(classMatch[1] ?? classMatch[2] ?? '');
      if (id.length === 0) {
        warnings.push(`Unsupported line ignored (could not read a class id): ${line}`);
        continue;
      }
      const box = getOrCreateClass(id);
      const label = classMatch[3] ?? classMatch[4];
      if (label !== undefined) box.label = label.trim();
      if (classMatch[5] === '{') stack.push({ kind: 'class', box });
      continue;
    }

    if (/^namespace\b/i.test(line)) {
      if (!warnedNamespace) {
        warnings.push('namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.');
        warnedNamespace = true;
      }
      if (line.endsWith('{')) stack.push({ kind: 'other' });
      continue;
    }

    const { clean, hadQuoted } = stripQuotedSegments(line);
    const relMatch = clean.match(REL_LINE);
    if (relMatch) {
      const fromId = stripIdQuotes(relMatch[1] ?? '');
      const token = relMatch[2] ?? '';
      const toId = stripIdQuotes(relMatch[3] ?? '');
      const info = REL_INFO[token];
      if (fromId.length > 0 && toId.length > 0 && info) {
        getOrCreateClass(fromId);
        getOrCreateClass(toId);
        relationships.push({
          from: fromId,
          to: toId,
          type: info.type,
          markerEnd: info.markerEnd,
          ...(relMatch[4] ? { label: relMatch[4].trim() } : {}),
        });
        if (hadQuoted) {
          warnings.push(`Relationship cardinalities are not yet supported, ignored: ${line}`);
        }
        continue;
      }
    }

    // Alternate one-line member syntax outside a `{ }` block:
    // `ClassName : +member text`.
    const standaloneMember = line.match(/^(?:`([^`]+)`|([A-Za-z_$][\w$]*))\s*:\s*(.+)$/);
    if (standaloneMember) {
      const id = stripIdQuotes(standaloneMember[1] ?? standaloneMember[2] ?? '');
      const box = getOrCreateClass(id);
      const rest = (standaloneMember[3] ?? '').trim();
      const visMatch = rest.match(/^([+\-#~])\s*(.+)$/);
      const visibility = visMatch ? (visMatch[1] as ClassMember['visibility']) : undefined;
      const memberText = (visMatch ? visMatch[2] : rest)!.trim();
      const member: ClassMember = visibility ? { visibility, text: memberText } : { text: memberText };
      if (memberText.includes('(')) box.methods.push(member);
      else box.attributes.push(member);
      continue;
    }

    if (/^(?:classDef|style|cssClass)\b/i.test(line)) {
      warnings.push(`Styling directives are not yet supported for class diagrams, ignored: ${line}`);
      continue;
    }
    if (/^note\b/i.test(line)) {
      warnings.push(`Notes are not yet supported for class diagrams, ignored: ${line}`);
      continue;
    }
    if (/^<<.*>>$/.test(line)) {
      if (!warnedAnnotation) {
        warnings.push('Class annotations (e.g. <<Interface>>) are not yet rendered, ignored.');
        warnedAnnotation = true;
      }
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (stack.length > 0) {
    warnings.push('One or more class/namespace blocks were not closed with a matching "}".');
  }

  return {
    ast: { direction, classes: [...classes.values()], relationships },
    warnings,
  };
}
