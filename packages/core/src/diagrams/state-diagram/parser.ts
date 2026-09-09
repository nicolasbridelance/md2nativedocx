/**
 * Parser for Mermaid `stateDiagram`/`stateDiagram-v2` (grammar verified
 * against mermaid.js.org/syntax/stateDiagram.html, fetched 2026-09-09).
 * Line-oriented, same forgiving convention as `../../parser/parser.ts` and
 * `../class-diagram/parser.ts`.
 *
 * V1 scope, deliberately:
 * - Flat transitions (`A --> B`, `A --> B : label`), start/end pseudostates
 *   (`[*]` as either endpoint — each occurrence gets its own synthesized
 *   node, see {@link resolveEndpoint}), state naming (`state "Label" as id`),
 *   the alternate one-line description (`id : Description`), and choice/
 *   fork/join stereotypes (`state id <<choice|fork|join>>`).
 * - `direction TD|TB|LR|BT|RL` (same TB->TD normalization as flowchart).
 *
 * NOT implemented yet, each degrading to "recognized and warned", never
 * silently dropped:
 * - Composite states (`state X { ... }`) — the block is recognized (a
 *   generic brace-nesting stack, same technique as `../class-diagram/
 *   parser.ts`'s namespace handling) and a warning is emitted once, but its
 *   contents are flattened into the top-level `states`/`transitions` lists
 *   rather than represented as a nested containment box. Real diagrams that
 *   rely on nesting to disambiguate same-named states in different parents
 *   may collide; anything else still renders correctly, just without the
 *   visual grouping.
 * - Concurrency dividers (a lone `--` inside a composite state) — falls
 *   through to the generic "unsupported line" warning.
 * - Notes (`note left|right of X` block or one-line `: text` form) and
 *   `classDef`/`class`/`style` styling — recognized and warned, skipped
 *   entirely (no positional/structural information lost, only cosmetic
 *   extras).
 */

import type { StateDiagram, StateNode, StateNodeKind } from './types.js';

export interface StateDiagramParseResult {
  ast: StateDiagram;
  warnings: string[];
}

const STATE_ALIAS = /^state\s+"([^"]*)"\s+as\s+(\S+?)\s*(\{)?\s*$/i;
const STATE_DECL = /^state\s+(\S+)\s*(?:<<(choice|fork|join)>>)?\s*(\{)?\s*$/i;
const DESCRIPTION = /^(\S+)\s*:\s*(.+)$/;
const NOTE_BLOCK_OPEN = /^note\s+(?:left|right)\s+of\s+\S+\s*$/i;
const NOTE_ONE_LINE = /^note\s+(?:left|right)\s+of\s+\S+\s*:\s*.+$/i;

export function parseStateDiagram(text: string): StateDiagramParseResult {
  const warnings: string[] = [];
  const states = new Map<string, StateNode>();
  const transitions: StateDiagram['transitions'] = [];
  let direction: StateDiagram['direction'] = 'TD';

  function getOrCreateState(id: string, kind: StateNodeKind = 'normal'): StateNode {
    let node = states.get(id);
    if (!node) {
      node = { id, label: id, kind };
      states.set(id, node);
    }
    return node;
  }

  let pseudoCounter = 0;
  function resolveEndpoint(endpoint: string, role: 'from' | 'to'): string {
    if (endpoint !== '[*]') {
      getOrCreateState(endpoint);
      return endpoint;
    }
    const id = `__pseudo_${pseudoCounter++}`;
    getOrCreateState(id, role === 'from' ? 'start' : 'end');
    return id;
  }

  // Generic brace-nesting stack (see module doc comment): only used to know
  // when a composite state's `}` closes, since its contents are otherwise
  // parsed exactly like top-level lines (flattened).
  let braceDepth = 0;
  let inNoteBlock = false;
  let warnedComposite = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^stateDiagram(?:-v2)?\b/i.test(line)) continue;

    if (inNoteBlock) {
      if (/^end\s+note$/i.test(line)) inNoteBlock = false;
      continue;
    }
    if (NOTE_BLOCK_OPEN.test(line)) {
      inNoteBlock = true;
      warnings.push(`Notes are not yet supported for state diagrams, ignored: ${line}`);
      continue;
    }
    if (NOTE_ONE_LINE.test(line)) {
      warnings.push(`Notes are not yet supported for state diagrams, ignored: ${line}`);
      continue;
    }

    if (line === '}') {
      if (braceDepth > 0) braceDepth--;
      else warnings.push(`Unexpected "}" without a matching block opener: ${line}`);
      continue;
    }

    const dirMatch = line.match(/^direction\s+(TD|TB|LR|BT|RL)\b/i);
    if (dirMatch) {
      const requested = dirMatch[1]!.toUpperCase();
      direction = requested === 'TB' ? 'TD' : (requested as StateDiagram['direction']);
      continue;
    }

    const aliasMatch = line.match(STATE_ALIAS);
    if (aliasMatch) {
      const label = aliasMatch[1] ?? '';
      const id = aliasMatch[2] ?? '';
      const node = getOrCreateState(id);
      node.label = label;
      if (aliasMatch[3] === '{') {
        braceDepth++;
        if (!warnedComposite) {
          warnings.push('Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.');
          warnedComposite = true;
        }
      }
      continue;
    }

    const declMatch = line.match(STATE_DECL);
    if (declMatch) {
      const id = declMatch[1] ?? '';
      const kindWord = declMatch[2] as 'choice' | 'fork' | 'join' | undefined;
      const node = getOrCreateState(id, kindWord ?? 'normal');
      if (kindWord) node.kind = kindWord;
      if (declMatch[3] === '{') {
        braceDepth++;
        if (!warnedComposite) {
          warnings.push('Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.');
          warnedComposite = true;
        }
      }
      continue;
    }

    // Split on the literal `-->` (and, for the target side, the literal
    // `:` label separator) rather than one combined regex spanning both
    // endpoints — a combined form trips eslint-plugin-security's
    // detect-unsafe-regex heuristic (same false positive `../quadrant/
    // parser.ts`'s POINT_TAIL comment already documents), even though it has
    // no actual nested-quantifier backtracking hazard.
    const arrowIdx = line.indexOf('-->');
    if (arrowIdx !== -1) {
      const fromToken = line.slice(0, arrowIdx).trim();
      const right = line.slice(arrowIdx + 3).trim();
      const colonIdx = right.indexOf(':');
      const toToken = (colonIdx === -1 ? right : right.slice(0, colonIdx)).trim();
      const label = colonIdx === -1 ? undefined : right.slice(colonIdx + 1).trim();
      if (fromToken.length > 0 && toToken.length > 0) {
        const from = resolveEndpoint(fromToken, 'from');
        const to = resolveEndpoint(toToken, 'to');
        transitions.push({ from, to, ...(label ? { label } : {}) });
        continue;
      }
    }

    if (/^(?:classDef|class|style)\b/i.test(line)) {
      warnings.push(`Styling directives are not yet supported for state diagrams, ignored: ${line}`);
      continue;
    }

    const descMatch = line.match(DESCRIPTION);
    if (descMatch) {
      const id = descMatch[1] ?? '';
      const node = getOrCreateState(id);
      node.label = (descMatch[2] ?? '').trim();
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (braceDepth > 0) {
    warnings.push('One or more composite state blocks were not closed with a matching "}".');
  }

  return {
    ast: { direction, states: [...states.values()], transitions },
    warnings,
  };
}
