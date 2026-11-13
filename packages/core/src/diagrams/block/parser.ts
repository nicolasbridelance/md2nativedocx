/**
 * Parser for Mermaid `block-beta`: `columns N`, blocks with the common shape
 * delimiters and an optional `:span`, `space` / `space:N`, nested
 * `block:id:span ... end` groups, links (`a --> b`, `a -- "text" --> b`,
 * `---`, `-.->`, `==>`), `style`, `classDef`, `class` and `:::name`.
 * Forgiving like the other parsers: an unrecognized line is a warning, never
 * a throw. Capped (hostile input) at 500 blocks, 200 links, nesting depth 8
 * and 24 columns; frontmatter is skipped with one warning. Exotic shapes
 * (cylinder, hexagon, parallelogram, arrow blocks, ...) fall back to a
 * rectangle keeping their label.
 */

import type { BlockCell, BlockDiagram, BlockLink, BlockShape, BlockStyle } from './types.js';

export interface BlockParseResult {
  ast: BlockDiagram;
  warnings: string[];
}

const MAX_BLOCKS = 500;
const MAX_LINKS = 200;
const MAX_DEPTH = 8;
const MAX_COLUMNS = 24;
const MAX_SPAN = 24;

/** Opening / closing delimiters, longest opener first. */
const SHAPES: Array<{ open: string; close: string[]; shape: BlockShape }> = [
  { open: '(((', close: [')))'], shape: 'circle' },
  { open: '((', close: ['))'], shape: 'circle' },
  { open: '([', close: ['])'], shape: 'stadium' },
  { open: '[(', close: [')]'], shape: 'rect' },
  { open: '[[', close: [']]'], shape: 'rect' },
  { open: '[/', close: ['/]', '\\]'], shape: 'rect' },
  { open: '[\\', close: ['\\]', '/]'], shape: 'rect' },
  { open: '<[', close: [']>'], shape: 'rect' },
  { open: '{{', close: ['}}'], shape: 'rect' },
  { open: '{', close: ['}'], shape: 'diamond' },
  { open: '(', close: [')'], shape: 'round' },
  { open: '>', close: [']'], shape: 'rect' },
  { open: '[', close: [']'], shape: 'rect' },
];

const ID_CHAR = /[A-Za-z0-9_.-]/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LINK = /(<?)(-->|---|-\.->|-\.-|==>|===|--[xo]|<-->)/;

function unquote(s: string): string {
  const t = s.trim();
  const q = t[0];
  if ((q === '"' || q === "'") && t.length >= 2 && t.endsWith(q)) return t.slice(1, -1);
  return t;
}

function newCell(kind: BlockCell['kind'], id: string | undefined, label: string, shape: BlockShape, span: number): BlockCell {
  return { kind, ...(id !== undefined ? { id } : {}), label, shape, span, style: {}, children: [] };
}

/** `fill:#f9f,stroke:#333,color:#fff` -> validated colors; others dropped. */
function parseStyle(text: string): BlockStyle {
  const out: BlockStyle = {};
  for (const part of text.split(',')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!HEX.test(raw)) continue;
    const hex = (raw.length === 4 ? raw.slice(1).replace(/./g, (c) => c + c) : raw.slice(1)).toUpperCase();
    if (key === 'fill') out.fill = hex;
    else if (key === 'stroke') out.stroke = hex;
    else if (key === 'color') out.color = hex;
  }
  return out;
}

interface Token {
  id: string;
  label?: string;
  shape: BlockShape;
  span: number;
  cls?: string;
}

/** Read one block token (`id`, optional shape, `:span`, `:::class`) from `s` at `pos`. */
function readToken(s: string, pos: number): { token: Token; next: number } | undefined {
  let i = pos;
  while (i < s.length && ID_CHAR.test(s[i] ?? '')) i++;
  if (i === pos) return undefined;
  const id = s.slice(pos, i);
  let label: string | undefined;
  let shape: BlockShape = 'rect';
  for (const def of SHAPES) {
    if (!s.startsWith(def.open, i)) continue;
    const start = i + def.open.length;
    let end = -1;
    let closeLen = 0;
    const q = s[start];
    const from = q === '"' || q === "'" ? ((s.indexOf(q, start + 1) + 1) || start) : start;
    for (const c of def.close) {
      const at = s.indexOf(c, from);
      if (at >= 0 && (end < 0 || at < end)) {
        end = at;
        closeLen = c.length;
      }
    }
    if (end < 0) continue;
    label = unquote(s.slice(start, end));
    shape = def.shape;
    i = end + closeLen;
    // Arrow block direction suffix: `<["x"]>(right)`.
    if (def.open === '<[') {
      const m = s.slice(i).match(/^\(\s*\w+\s*\)/);
      if (m) i += m[0].length;
    }
    break;
  }
  let span = 1;
  const sm = s.slice(i).match(/^:(\d+)(?!:)/);
  if (sm) {
    span = Math.min(MAX_SPAN, Math.max(1, Number(sm[1])));
    i += sm[0].length;
  }
  let cls: string | undefined;
  const cm = s.slice(i).match(/^:::([A-Za-z0-9_-]+)/);
  if (cm) {
    cls = cm[1];
    i += cm[0].length;
  }
  return { token: { id, ...(label !== undefined ? { label } : {}), shape, span, ...(cls ? { cls } : {}) }, next: i };
}

export function parseBlock(text: string): BlockParseResult {
  const warnings: string[] = [];
  const root: BlockCell = newCell('group', undefined, '', 'rect', 1);
  const links: BlockLink[] = [];
  const byId = new Map<string, BlockCell>();
  const classDefs = new Map<string, BlockStyle>();
  const pendingClasses: Array<{ id: string; cls: string }> = [];
  const stack: BlockCell[] = [root];
  let count = 0;
  let inFrontmatter = false;
  let sawHeader = false;
  let warnedFrontmatter = false;
  let warnedBlocks = false;
  let warnedLinks = false;
  let warnedDepth = false;

  const current = (): BlockCell => stack[stack.length - 1] as BlockCell;

  /** Define or update a block in the current group. */
  const place = (t: Token): BlockCell | undefined => {
    const existing = byId.get(t.id);
    if (existing) {
      if (t.label !== undefined) existing.label = t.label;
      if (t.label !== undefined || t.shape !== 'rect') existing.shape = t.shape;
      return existing;
    }
    if (count >= MAX_BLOCKS) {
      if (!warnedBlocks) warnings.push(`Block diagram limited to ${MAX_BLOCKS} blocks; the rest were ignored.`);
      warnedBlocks = true;
      return undefined;
    }
    count++;
    const isSpace = t.id === 'space' && t.label === undefined;
    const cell = newCell(isSpace ? 'space' : 'block', isSpace ? undefined : t.id, t.label ?? t.id, t.shape, t.span);
    current().children.push(cell);
    if (!isSpace) byId.set(t.id, cell);
    return cell;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('Block diagram frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^block(?:-beta)?\b/i.test(line)) continue;
    }

    const cols = line.match(/^columns\s+(\d+|auto)\s*$/i);
    if (cols) {
      const n = (cols[1] ?? '').toLowerCase() === 'auto' ? undefined : Math.min(MAX_COLUMNS, Math.max(1, Number(cols[1])));
      if (n !== undefined) current().columns = n;
      continue;
    }

    if (/^end\s*$/i.test(line)) {
      if (stack.length > 1) stack.pop();
      else warnings.push('Unmatched "end" ignored.');
      continue;
    }

    const groupParts = line.split(':').map((p) => p.trim());
    const [groupKw, groupId, groupSpan] = groupParts;
    const isGroup =
      groupKw?.toLowerCase() === 'block' &&
      groupParts.length <= 3 &&
      (groupId === undefined || /^[A-Za-z0-9_.-]+$/.test(groupId)) &&
      (groupSpan === undefined || /^\d+$/.test(groupSpan));
    if (isGroup) {
      if (stack.length > MAX_DEPTH) {
        if (!warnedDepth) warnings.push(`Block nesting limited to ${MAX_DEPTH} levels; deeper groups were flattened.`);
        warnedDepth = true;
        stack.push(current());
        continue;
      }
      const id = groupId || undefined;
      const span = groupSpan ? Math.min(MAX_SPAN, Math.max(1, Number(groupSpan))) : 1;
      count++;
      const cell = newCell('group', id, '', 'rect', span);
      current().children.push(cell);
      if (id) byId.set(id, cell);
      stack.push(cell);
      continue;
    }

    const style = line.match(/^style\s+([A-Za-z0-9_.-]+)\s+(.+)$/i);
    if (style) {
      const target = byId.get(style[1] ?? '');
      if (target) target.style = { ...target.style, ...parseStyle(style[2] ?? '') };
      else warnings.push(`style for unknown block ignored: ${style[1]}`);
      continue;
    }
    const classDef = line.match(/^classDef\s+([A-Za-z0-9_-]+)\s+(.+)$/i);
    if (classDef) {
      classDefs.set(classDef[1] ?? '', parseStyle(classDef[2] ?? ''));
      continue;
    }
    const classAssign = line.match(/^class\s+([A-Za-z0-9_.,\s-]+?)\s+([A-Za-z0-9_-]+)$/i);
    if (classAssign) {
      for (const id of (classAssign[1] ?? '').split(',')) if (id.trim()) pendingClasses.push({ id: id.trim(), cls: classAssign[2] ?? '' });
      continue;
    }

    // Link line: `a --> b`, `a -- "text" --> b`, `a-->b`.
    const link = LINK.exec(line);
    if (link) {
      const op = link[2] ?? '';
      let left = line.slice(0, link.index);
      let label: string | undefined;
      // `a -- text --> b`: the label sits between a leading `--`/`-.`/`==` and the arrow.
      const labelled = left.match(/^(.*?)\s*(?:--|-\.|==)\s*(.+?)\s*$/);
      if (labelled) {
        left = labelled[1] ?? '';
        label = unquote(labelled[2] ?? '');
      }
      // `a -->|text| b`
      let right = line.slice(link.index + link[0].length).trim();
      const pipe = right.match(/^\|([^|]*)\|\s*(.*)$/);
      if (pipe) {
        label = unquote(pipe[1] ?? '');
        right = pipe[2] ?? '';
      }
      const a = readToken(left.trim(), 0);
      const b = readToken(right, 0);
      if (!a || !b) {
        warnings.push(`Unsupported link ignored: ${line}`);
        continue;
      }
      place(a.token);
      place(b.token);
      if (links.length >= MAX_LINKS) {
        if (!warnedLinks) warnings.push(`Block diagram limited to ${MAX_LINKS} links; the rest were ignored.`);
        warnedLinks = true;
        continue;
      }
      const bidirectional = link[1] === '<';
      const isArrow = op.endsWith('>') || /--[xo]$/.test(op);
      const dashed = op.includes('.');
      links.push({ from: a.token.id, to: b.token.id, ...(label ? { label } : {}), arrow: isArrow, dashed });
      if (bidirectional) links.push({ from: b.token.id, to: a.token.id, arrow: true, dashed });
      continue;
    }

    // A row of blocks.
    let pos = 0;
    let any = false;
    while (pos < line.length) {
      while (pos < line.length && /\s/.test(line[pos] ?? '')) pos++;
      if (pos >= line.length) break;
      const read = readToken(line, pos);
      if (!read) {
        warnings.push(`Unsupported text ignored: ${line.slice(pos)}`);
        break;
      }
      any = true;
      const cell = place(read.token);
      if (cell && read.token.span > 1) cell.span = read.token.span;
      if (cell && read.token.cls) pendingClasses.push({ id: read.token.id, cls: read.token.cls });
      pos = read.next;
    }
    if (!any) continue;
  }

  for (const { id, cls } of pendingClasses) {
    const target = byId.get(id);
    const def = classDefs.get(cls);
    if (target && def) target.style = { ...def, ...target.style };
  }
  if (stack.length > 1) warnings.push('Unclosed block group; closed automatically.');

  return { ast: { root, links }, warnings };
}
