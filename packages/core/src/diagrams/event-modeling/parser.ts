/**
 * Parser for Mermaid `eventmodeling`. Line-oriented and forgiving like the
 * other parsers: an unrecognized line is a warning, never a throw. Grammar
 * checked against the real `@mermaid-js/parser` 1.2.1: `tf|timeframe|rf|resetframe
 * <1-3 digits> <type> <Qualified.Name> (->> <id>)* ([[data]])? (inline data)?`,
 * `data <Name> {` block `}`, `note <id> {` block `}`, `entity <Name>` and
 * `gwt <id> given … (when …)? then …`. Mermaid rejects `title`/`accTitle` here
 * and inline `note` text; we warn and keep going. Capped (hostile input) at
 * 100 frames, 300 links, 100 data blocks, 100 notes and 50 scenarios.
 */

import type { EventModelingDiagram, EventModelingFrame, EventModelingKind, EventModelingScenario, EventModelingStatement } from './types.js';

export interface EventModelingParseResult {
  ast: EventModelingDiagram;
  warnings: string[];
}

const MAX_FRAMES = 100;
const MAX_LINKS = 300;
const MAX_DATA = 100;
const MAX_NOTES = 100;
const MAX_SCENARIOS = 50;
const MAX_BLOCK_CHARS = 2000;

const KINDS: Record<string, EventModelingKind> = {
  ui: 'ui',
  cmd: 'cmd',
  command: 'cmd',
  evt: 'evt',
  event: 'evt',
  rmo: 'rmo',
  readmodel: 'rmo',
  pcr: 'pcr',
  processor: 'pcr',
};
const TYPE = 'ui|cmd|command|evt|event|rmo|readmodel|pcr|processor';
const QNAME = String.raw`[_a-zA-Z]\w*(?:\.[_a-zA-Z]\w*)*`;
const FRAME = new RegExp(String.raw`^(tf|timeframe|rf|resetframe)\s+(\d{1,3})\s+(${TYPE})\s+(${QNAME})(.*)$`);
const STATEMENT = new RegExp(String.raw`(${TYPE})\s+(${QNAME})`, 'g');

/** Split `A.B.C` into namespace `A.B` and name `C`. */
function splitName(qualified: string): { namespace?: string; name: string } {
  const dot = qualified.lastIndexOf('.');
  return dot === -1 ? { name: qualified } : { namespace: qualified.slice(0, dot), name: qualified.slice(dot + 1) };
}

/** True when the rest of a `data` / `note` line is the block opener `{`, optionally preceded by a `type`. */
function opensBlock(rest: string): boolean {
  return rest.replace(/^`\w+`/, '').trim() === '{';
}

function statements(text: string): EventModelingStatement[] {
  const out: EventModelingStatement[] = [];
  for (const m of text.matchAll(STATEMENT)) out.push({ kind: KINDS[m[1] as string] as EventModelingKind, name: m[2] as string });
  return out;
}

export function parseEventModeling(text: string): EventModelingParseResult {
  const warnings: string[] = [];
  const ast: EventModelingDiagram = { frames: [], data: new Map(), notes: [], scenarios: [] };
  const capped = new Set<string>();
  let inFrontmatter = false;
  let sawHeader = false;
  let block: { kind: 'data' | 'note'; key: string; lines: string[] } | undefined;
  let links = 0;

  const full = (kind: string, count: number, max: number): boolean => {
    if (count < max) return false;
    if (!capped.has(kind)) warnings.push(`Event Modeling diagram limited to ${max} ${kind}; the rest were ignored.`);
    capped.add(kind);
    return true;
  };

  const closeBlock = (): void => {
    if (!block) return;
    const body = block.lines.join('\n').slice(0, MAX_BLOCK_CHARS);
    if (block.kind === 'data') {
      if (!full('data blocks', ast.data.size, MAX_DATA)) ast.data.set(block.key, body);
    } else if (!full('notes', ast.notes.length, MAX_NOTES)) {
      ast.notes.push({ frame: block.key, text: body });
    }
    block = undefined;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (block) {
      if (line === '}') closeBlock();
      else block.lines.push(line);
      continue;
    }
    if (line.length === 0 || line.startsWith('%%') || line.startsWith('//')) continue;
    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!capped.has('frontmatter')) warnings.push('Event Modeling frontmatter/config is not supported and was ignored.');
      capped.add('frontmatter');
      continue;
    }
    if (inFrontmatter) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^eventmodeling\b/i.test(line)) continue;
    }

    let m: RegExpMatchArray | null;
    if ((m = FRAME.exec(line))) {
      const reset = (m[1] as string).startsWith('r');
      const { namespace, name } = splitName(m[4] as string);
      const rest = m[5] ?? '';
      const frame: EventModelingFrame = {
        id: m[2] as string,
        reset,
        kind: KINDS[m[3] as string] as EventModelingKind,
        name,
        sources: [],
      };
      if (namespace) frame.namespace = namespace;
      let tail = rest.trim();
      for (let src = /^->>\s*(\d{1,3})\s*/.exec(tail); src; src = /^->>\s*(\d{1,3})\s*/.exec(tail)) {
        if (!full('links', links, MAX_LINKS)) {
          frame.sources.push(src[1] as string);
          links++;
        }
        tail = tail.slice(src[0].length);
      }
      const ref = /^\[\[\s*([_a-zA-Z][\w.]*)\s*\]\]/.exec(tail);
      if (ref) {
        frame.dataRef = ref[1] as string;
        tail = tail.slice(ref[0].length).trim();
      }
      if (tail.length > 0) {
        const value = tail.replace(/^`(?:json|jsobj|figma|salt|uri|md|html|text)`\s*/, '');
        if (/^(?:\{.*\}|".*"|'.*')$/.test(value)) frame.inlineData = value.slice(0, MAX_BLOCK_CHARS);
        else warnings.push(`Unsupported trailing text ignored: ${line}`);
      }
      if (!full('frames', ast.frames.length, MAX_FRAMES)) ast.frames.push(frame);
    } else if ((m = line.match(/^data\s+([_a-zA-Z][\w.]*)\s*(.*)$/)) && opensBlock(m[2] ?? '')) {
      block = { kind: 'data', key: m[1] as string, lines: [] };
    } else if ((m = line.match(/^note\s+(\d{1,3})\s*(.*)$/)) && opensBlock(m[2] ?? '')) {
      block = { kind: 'note', key: m[1] as string, lines: [] };
    } else if (/^entity\s+[\w.]+$/.test(line)) {
      // Declares a model entity; it has no visual of its own in Mermaid either.
    } else if ((m = line.match(/^gwt\s+(\d{1,3})\s+given\s+(.+)$/))) {
      const body = m[2] as string;
      const thenAt = body.search(/\bthen\b/);
      if (thenAt === -1) {
        warnings.push(`Scenario ignored (missing then): ${line}`);
        continue;
      }
      const head = body.slice(0, thenAt);
      const whenAt = head.search(/\bwhen\b/);
      const scenario: EventModelingScenario = {
        frame: m[1] as string,
        given: statements(whenAt === -1 ? head : head.slice(0, whenAt)),
        when: whenAt === -1 ? [] : statements(head.slice(whenAt + 4)),
        then: statements(body.slice(thenAt + 4)),
      };
      if (!full('scenarios', ast.scenarios.length, MAX_SCENARIOS)) ast.scenarios.push(scenario);
    } else if (/^(?:title|acc(?:Title|Descr))\b/.test(line)) {
      warnings.push(`Mermaid does not accept this line in an eventmodeling diagram; ignored: ${line}`);
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }
  if (block) {
    warnings.push(`Unclosed ${block.kind} block ${block.key}; kept as read.`);
    closeBlock();
  }

  const known = new Set(ast.frames.map((f) => f.id));
  for (const f of ast.frames) {
    const missing = f.sources.filter((s) => !known.has(s));
    if (missing.length > 0) warnings.push(`Frame ${f.id} references unknown frame(s) ${missing.join(', ')}; those links were ignored.`);
    f.sources = f.sources.filter((s) => known.has(s));
  }
  for (const f of ast.frames) {
    if (f.dataRef !== undefined && !ast.data.has(f.dataRef)) {
      warnings.push(`Frame ${f.id} references unknown data "${f.dataRef}".`);
      delete f.dataRef;
    }
  }
  ast.notes = ast.notes.filter((n) => known.has(n.frame) || (warnings.push(`Note ignored (unknown frame ${n.frame}).`), false));
  ast.scenarios = ast.scenarios.filter((s) => known.has(s.frame) || (warnings.push(`Scenario ignored (unknown frame ${s.frame}).`), false));

  return { ast, warnings };
}
