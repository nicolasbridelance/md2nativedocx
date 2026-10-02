/**
 * Parser for Mermaid `wardley-beta` / `wardley`. Line-oriented and forgiving
 * like the other parsers: an unrecognized or invalid line is a warning, never
 * a throw. Coordinates are `[visibility, evolution]`, each 0-1 (scaled to
 * percent) or 0-100; an out-of-range entity is skipped with a warning (Mermaid
 * itself throws). Capped (hostile input) at 200 nodes, 500 links and 100 each
 * of the other entity kinds; frontmatter is skipped with one warning.
 */

import type { WardleyAnnotation, WardleyFlow, WardleyLink, WardleyMap, WardleyNode, WardleyPipeline, WardleyStage, WardleyStrategy } from './types.js';

export interface WardleyParseResult {
  ast: WardleyMap;
  warnings: string[];
}

const MAX_NODES = 200;
const MAX_LINKS = 500;
const MAX_OTHER = 100;
const MIN_SIZE = 300;
const MAX_SIZE = 2400;

const STRATEGIES: readonly string[] = ['build', 'buy', 'outsource', 'market'];
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`\[\s*(${NUM})\s*,\s*(${NUM})\s*\]`);
const SINGLE = new RegExp(String.raw`\[\s*(${NUM})\s*\]`);
const LABEL_OFFSET = new RegExp(String.raw`\blabel\s*\[\s*(${NUM})\s*,\s*(${NUM})\s*\]`);
const ARROW = /-\.->|-->|->|\+'[^']*'(?:<>|<|>)|\+<>|\+<|\+>/;

function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** 0-1 -> percent, 0-100 as is; `undefined` when out of range or not finite. */
function toPercent(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const p = value <= 1 ? value * 100 : value;
  return p >= 0 && p <= 100 ? p : undefined;
}

function flowOf(arrow: string): { flow?: WardleyFlow; label?: string } {
  if (!arrow.startsWith('+')) return {};
  const label = /^\+'([^']*)'/.exec(arrow)?.[1];
  const flow: WardleyFlow = arrow.includes('<>') ? 'bidirectional' : arrow.includes('<') ? 'backward' : 'forward';
  return { flow, label };
}

export function parseWardley(text: string): WardleyParseResult {
  const warnings: string[] = [];
  const ast: WardleyMap = {
    nodes: [],
    links: [],
    pipelines: [],
    evolves: [],
    notes: [],
    annotations: [],
    accelerators: [],
    deaccelerators: [],
    stages: [],
  };
  const byName = new Map<string, WardleyNode>();
  let inFrontmatter = false;
  let sawHeader = false;
  let pipeline: WardleyPipeline | undefined;
  let skipPipeline = false;
  let pipelineY = 0;
  const capped = new Set<string>();

  const full = (kind: string, count: number, max: number): boolean => {
    if (count < max) return false;
    if (!capped.has(kind)) warnings.push(`Wardley map limited to ${max} ${kind}; the rest were ignored.`);
    capped.add(kind);
    return true;
  };

  const addNode = (node: WardleyNode, line: string): void => {
    if (byName.has(node.name)) {
      warnings.push(`Duplicate name ignored: ${line}`);
      return;
    }
    if (full('components', ast.nodes.length, MAX_NODES)) return;
    byName.set(node.name, node);
    ast.nodes.push(node);
  };

  const pair = (line: string, context: string): { v: number; e: number } | undefined => {
    const m = PAIR.exec(line);
    const v = m ? toPercent(Number(m[1])) : undefined;
    const e = m ? toPercent(Number(m[2])) : undefined;
    if (v === undefined || e === undefined) {
      warnings.push(`${context} ignored (bad or out-of-range [visibility, evolution]): ${line}`);
      return undefined;
    }
    return { v, e };
  };

  const labelOffset = (line: string): Pick<WardleyNode, 'labelDx' | 'labelDy'> => {
    const m = LABEL_OFFSET.exec(line);
    return m ? { labelDx: Number(m[1]), labelDy: Number(m[2]) } : {};
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!capped.has('frontmatter')) warnings.push('Wardley frontmatter/config is not supported and was ignored.');
      capped.add('frontmatter');
      continue;
    }
    if (inFrontmatter) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^wardley(?:-beta)?\b/i.test(line)) continue;
    }
    if (/^acc(?:Title|Descr)\b/.test(line)) continue;

    let m: RegExpMatchArray | null;

    if (pipeline || skipPipeline) {
      if (line.startsWith('}')) {
        pipeline = undefined;
        skipPipeline = false;
        continue;
      }
      if (!pipeline) continue;
      if ((m = line.match(/^component\s+(.+)$/i))) {
        const body = m[1] ?? '';
        const open = body.indexOf('[');
        const single = SINGLE.exec(body);
        const e = single ? toPercent(Number(single[1])) : undefined;
        const name = unquote(open === -1 ? body : body.slice(0, open));
        if (e === undefined || name === '') {
          warnings.push(`Pipeline component ignored (bad or out-of-range [evolution]): ${line}`);
          continue;
        }
        const before = ast.nodes.length;
        addNode({ name, kind: 'pipeline-component', x: e, y: pipelineY, ...labelOffset(body) }, line);
        if (ast.nodes.length > before) pipeline.components.push(name);
        continue;
      }
      warnings.push(`Unsupported line ignored in pipeline: ${line}`);
      continue;
    }

    if ((m = line.match(/^title\s+(.+)$/i))) {
      ast.title = unquote(m[1] ?? '');
    } else if (/^size\b/i.test(line) && PAIR.test(line)) {
      const sz = PAIR.exec(line) as RegExpExecArray;
      const clamp = (n: number): number => Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
      ast.size = { width: clamp(Number(sz[1])), height: clamp(Number(sz[2])) };
    } else if ((m = line.match(/^(anchor|component)\s+(.+)$/i))) {
      const kind = (m[1] ?? '').toLowerCase() === 'anchor' ? 'anchor' : 'component';
      const body = m[2] ?? '';
      const name = unquote(body.slice(0, Math.max(0, body.indexOf('['))));
      const p = name === '' ? undefined : pair(line, kind === 'anchor' ? 'Anchor' : 'Component');
      if (!p) {
        if (name === '') warnings.push(`Unsupported line ignored: ${line}`);
        continue;
      }
      const node: WardleyNode = { name, kind, x: p.e, y: p.v, ...labelOffset(body) };
      const decorator = /\(\s*(\w+)\s*\)\s*$/.exec(body)?.[1]?.toLowerCase();
      if (decorator === 'inertia') node.inertia = true;
      else if (decorator && STRATEGIES.includes(decorator)) node.strategy = decorator as WardleyStrategy;
      addNode(node, line);
    } else if ((m = line.match(/^pipeline\s+(.+?)\s*\{\s*$/i))) {
      const parent = byName.get(unquote(m[1] ?? ''));
      if (!parent) {
        warnings.push(`Pipeline ignored (unknown component): ${line}`);
        skipPipeline = true;
        continue;
      }
      pipeline = { parent: parent.name, components: [] };
      pipelineY = parent.y;
      ast.pipelines.push(pipeline);
    } else if ((m = line.match(/^evolve\s+(.+)$/i))) {
      const body = (m[1] ?? '').trim();
      const cut = body.search(/\s\S+$/);
      const name = unquote(cut === -1 ? body : body.slice(0, cut));
      const target = cut === -1 ? undefined : toPercent(Number(body.slice(cut).trim()));
      if (!byName.has(name) || target === undefined) warnings.push(`Evolve ignored (unknown component or bad target): ${line}`);
      else if (!full('evolve arrows', ast.evolves.length, MAX_OTHER)) ast.evolves.push({ name, target });
    } else if ((m = line.match(/^note\s+"([^"]*)"\s*(\[.*)$/i))) {
      const p = pair(m[2] ?? '', 'Note');
      if (p && !full('notes', ast.notes.length, MAX_OTHER)) ast.notes.push({ text: m[1] ?? '', x: p.e, y: p.v });
    } else if ((m = line.match(/^annotations\s*(\[.*)$/i))) {
      const p = pair(m[1] ?? '', 'Annotations box');
      if (p) ast.annotationsBox = { x: p.e, y: p.v };
    } else if ((m = line.match(/^annotation\s+(\d+)\s*,(.*)$/i))) {
      const rest = m[2] ?? '';
      const p = pair(rest, 'Annotation');
      if (p && !full('annotations', ast.annotations.length, MAX_OTHER)) {
        const a: WardleyAnnotation = { number: Number(m[1]), x: p.e, y: p.v };
        const quoted = /"([^"]*)"/.exec(rest);
        if (quoted) a.text = quoted[1] ?? '';
        ast.annotations.push(a);
      }
    } else if ((m = line.match(/^(accelerator|deaccelerator)\s+(.+?)\s*(\[.*)$/i))) {
      const p = pair(m[3] ?? '', 'Accelerator');
      const list = (m[1] ?? '').toLowerCase() === 'accelerator' ? ast.accelerators : ast.deaccelerators;
      if (p && !full('accelerators', list.length, MAX_OTHER)) list.push({ text: unquote(m[2] ?? ''), x: p.e, y: p.v });
    } else if ((m = line.match(/^evolution\s+(.+)$/i))) {
      const stages: WardleyStage[] = [];
      for (const part of (m[1] ?? '').split('->')) {
        const [rawName, rawBoundary] = part.split('@');
        const name = unquote((rawName ?? '').trim());
        if (name === '') continue;
        const stage: WardleyStage = { name };
        const b = rawBoundary === undefined ? undefined : toPercent(Number(rawBoundary.trim()));
        if (b !== undefined) stage.boundary = b;
        stages.push(stage);
      }
      ast.stages = stages.slice(0, 12);
    } else if ((m = ARROW.exec(line))) {
      const arrow = m[0];
      const left = unquote(line.slice(0, m.index ?? 0).trim());
      let right = line.slice((m.index ?? 0) + arrow.length);
      let annotation: string | undefined;
      const semi = right.indexOf(';');
      if (semi !== -1) {
        annotation = right.slice(semi + 1).trim();
        right = right.slice(0, semi);
      }
      const target = unquote(right.trim());
      const { flow, label } = flowOf(arrow);
      const link: WardleyLink = { source: left, target, dashed: arrow === '-.->', ...(flow ? { flow } : {}) };
      const lbl = label ?? (annotation === '' ? undefined : annotation);
      if (lbl !== undefined) link.label = lbl;
      if (!byName.has(left) || !byName.has(target)) warnings.push(`Link ignored (unknown component): ${line}`);
      else if (!full('links', ast.links.length, MAX_LINKS)) ast.links.push(link);
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  return { ast, warnings };
}
