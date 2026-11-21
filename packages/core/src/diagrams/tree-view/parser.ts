/**
 * Parser for Mermaid `treeView-beta`, read as Mermaid's own grammar reads it (`@mermaid-js/parser`'s
 * `treeView.langium` and `boxDrawingPreprocessor.ts`, mermaid@12.3.0; checked example by example by
 * `tools/mermaid-differential`). This file is the project's own code (CC0): the rules below are restated
 * from that grammar, nothing of it is copied.
 *
 * - **Hierarchy.** A node's level is the width of its leading whitespace, a tab counting as one column;
 *   a node closes every open node whose level is not smaller than its own.
 * - **Box-drawing trees** (`├──`, `└──`, `│`, also their heavy forms): when any line has one of these
 *   characters, the whole tree is read that way. A line's level is the column of its `├`/`└` (tabs
 *   expanded to 4 columns), divided by the tree's indent step (the column of the first branch that is
 *   not at column 0, 4 by default) and rounded, plus one. A line with only `│` and spaces is
 *   decoration. A line indented without a branch is an error for Mermaid: here a warning, and the line
 *   keeps its raw indentation.
 * - **Name.** Quoted (`"my file"` or `'my file'`, quotes removed) or bare: everything up to an annotation
 *   or the end of the line, trailing spaces dropped. A trailing `/` marks a directory and is not shown.
 * - **Annotations**, after a space, in any order: `:::class`, `icon(name)` or `icon(pack:name)`, `## text`
 *   (description, to the end of the line). One of a kind: the last one wins. Without the space before
 *   it, `a.ts:::x` is a name, as in Mermaid.
 * - **Header lines** right after `treeView-beta`, before the first node: `title …`, `accTitle: …`,
 *   `accDescr: …` or `accDescr { … }`.
 *
 * Anything Mermaid would reject is a warning, never a throw. Depth is capped at 32 and nodes at 2000
 * (hostile input). Labels and descriptions are kept verbatim: escaping is the translators' job.
 */

import type { TreeViewDiagram, TreeViewNode } from './types.js';

export interface TreeViewParseResult {
  ast: TreeViewDiagram;
  warnings: string[];
}

const MAX_DEPTH = 32;
const MAX_NODES = 2000;

const BOX_CHAR = /[─━│┃└┗├┣]/;
const BRANCH_CHAR = /[└┗├┣]/;
const DASH_CHAR = /[─━]/;
const DECORATION_ONLY = /^[\s│┃]+$/;
const BOX_ONLY = /^[\s─━│┃└┗├┣]+$/;

/** An annotation, with the whitespace that must precede it. */
const CLASS_ANNOTATION = /^[ \t]+:::[ \t]*([A-Za-z_][\w-]*)/;
/** `icon(name)` or `icon(pack:name)`; the one-colon rule is checked by {@link isIconName}. */
const ICON_ANNOTATION = /^[ \t]+icon\(([\w:-]*)\)/;
const DESC_ANNOTATION = /^[ \t]+##(.*)$/;
/** The icons Mermaid ships with the tree view itself (`treeView/icons.ts`), with or without their pack prefix. */
const BUILT_IN_ICONS: ReadonlySet<string> = new Set(['folder', 'file', 'mermaid-treeview:folder', 'mermaid-treeview:file']);
/** Where a bare name stops: the first annotation. */
const ANNOTATION_START = /[ \t]+(?::::[ \t]*[A-Za-z_]|icon\(|##)/;

/** An icon name as Mermaid's grammar takes it (`[\w-]*` then an optional `:[\w-]+`): at most one colon, never last. */
function isIconName(name: string): boolean {
  const parts = name.split(':');
  return parts.length === 1 || (parts.length === 2 && parts[1] !== '');
}

/** One content line: its level and the text after the indentation. */
interface Line {
  level: number;
  text: string;
}

export function parseTreeView(text: string): TreeViewParseResult {
  const warnings: string[] = [];
  const ast: TreeViewDiagram = { nodes: [] };
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((l) => l.trim() !== '' && !l.trim().startsWith('%%'));
  if (header === -1) return { ast, warnings };
  const headerLine = (lines[header] ?? '').trim();
  const headerRest = headerLine.replace(/^treeView(?:-beta)?/i, '').trim();
  if (headerRest === headerLine) {
    warnings.push(`Not a treeView-beta header, read as one: ${headerLine}`);
  } else if (headerRest !== '') {
    warnings.push(`Unrecognized text after the treeView-beta header ignored: ${headerRest}`);
  }

  const body = readHeaderLines(lines.slice(header + 1), ast, warnings);
  const content = toLevels(body, warnings);
  buildTree(content, ast, warnings);
  return { ast, warnings };
}

/**
 * Consume the `title` / `accTitle` / `accDescr` lines that may open the body (blank lines and comments
 * between them allowed) and return the lines left.
 */
function readHeaderLines(lines: string[], ast: TreeViewDiagram, warnings: string[]): string[] {
  let i = 0;
  for (; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('%%')) continue;
    let m: RegExpExecArray | null;
    if (line === 'title' || /^title[\t ]/.test(line)) {
      const title = stripComment(line.slice('title'.length));
      if (title) ast.title = title;
    } else if ((m = /^accTitle[\t ]*:(.*)$/.exec(line))) {
      const accTitle = stripComment(m[1] ?? '');
      if (accTitle) ast.accTitle = accTitle;
    } else if ((m = /^accDescr[\t ]*:(.*)$/.exec(line))) {
      const accDescr = stripComment(m[1] ?? '');
      if (accDescr) ast.accDescr = accDescr;
    } else if (/^accDescr[\t ]*\{/.test(line)) {
      // `accDescr { … }`, on one line or several.
      const start = line.indexOf('{') + 1;
      const parts: string[] = [];
      let rest = line.slice(start);
      while (!rest.includes('}') && i + 1 < lines.length) {
        parts.push(rest);
        rest = lines[++i] ?? '';
      }
      if (!rest.includes('}')) warnings.push('accDescr { … } is never closed; read to the end of the diagram.');
      parts.push(rest.includes('}') ? rest.slice(0, rest.indexOf('}')) : rest);
      const accDescr = parts.map((p) => p.trim()).filter((p) => p !== '').join('\n');
      if (accDescr) ast.accDescr = accDescr;
    } else {
      break;
    }
  }
  return lines.slice(i);
}

/** Text before a `%%` comment, trimmed (Mermaid stops a title at its first `%%`). */
function stripComment(text: string): string {
  const at = text.indexOf('%%');
  return (at < 0 ? text : text.slice(0, at)).trim();
}

/** Expand tabs to 4 columns, as Mermaid does before reading a box-drawing tree. */
const expandTabs = (line: string): string => line.replace(/\t/g, '    ');

/** Each content line with its level (blank lines, comments and box decoration dropped). */
function toLevels(lines: string[], warnings: string[]): Line[] {
  const content = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith('%%') && !isHeaderLine(l));
  for (const l of lines.filter(isHeaderLine)) {
    warnings.push(`A ${l.trim().split(/[\s:{]/)[0]} line must come right after treeView-beta; ignored: ${l.trim()}`);
  }
  const boxDrawing = content.some((l) => !DECORATION_ONLY.test(l) && BOX_CHAR.test(l));

  if (!boxDrawing) {
    return content.map((l) => {
      const indent = /^[ \t]*/.exec(l)?.[0].length ?? 0;
      return { level: indent, text: l.slice(indent) };
    });
  }

  const expanded = content.filter((l) => !DECORATION_ONLY.test(l)).map(expandTabs);
  const step = expanded.map((l) => BRANCH_CHAR.exec(l)?.index ?? 0).find((col) => col > 0) ?? 4;
  const result: Line[] = [];
  for (const line of expanded) {
    const branch = BRANCH_CHAR.exec(line);
    if (branch) {
      let pos = branch.index + 1;
      while (pos < line.length && DASH_CHAR.test(line[pos] ?? '')) pos++;
      while (pos < line.length && line[pos] === ' ') pos++;
      const rest = line.slice(pos).trimEnd();
      if (rest === '') {
        warnings.push(`Empty entry ignored (nothing after the branch): ${line.trim()}`);
        continue;
      }
      result.push({ level: (Math.round(branch.index / step) + 1) * 4, text: rest });
    } else if (BOX_ONLY.test(line)) {
      continue;
    } else if (BOX_CHAR.test(line)) {
      // Box characters but no branch (`│   name`): Mermaid reads the line as written, `│` included.
      const indent = /^ */.exec(line)?.[0].length ?? 0;
      result.push({ level: indent, text: line.slice(indent) });
    } else {
      const indent = /^ */.exec(line)?.[0].length ?? 0;
      if (indent > 0) {
        warnings.push(`Indented line without ├── or └── in a box-drawing tree (Mermaid rejects it), read at its indentation: ${line.trim()}`);
      }
      result.push({ level: indent, text: line.slice(indent) });
    }
  }
  return result;
}

/** A `title`, `accTitle` or `accDescr` line (Mermaid's box-drawing step keeps them out of the tree). */
function isHeaderLine(line: string): boolean {
  return /^\s*(title[\t ]|accTitle[\t ]*:|accDescr[\t ]*[:{])/.test(line);
}

/** Read each line's name and annotations and hang it in the tree. */
function buildTree(lines: Line[], ast: TreeViewDiagram, warnings: string[]): void {
  /** Open ancestors: level and node index. */
  const stack: Array<{ level: number; index: number }> = [];
  let warnedDepth = false;
  let warnedCap = false;
  let warnedClass = false;

  for (const { level, text } of lines) {
    const read = readNode(text, warnings);
    if (!read) continue;

    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
    if (stack.length >= MAX_DEPTH) {
      if (!warnedDepth) warnings.push(`TreeView nesting limited to ${MAX_DEPTH} levels; deeper lines ignored.`);
      warnedDepth = true;
      continue;
    }
    if (ast.nodes.length >= MAX_NODES) {
      if (!warnedCap) warnings.push(`TreeView limited to ${MAX_NODES} nodes; the rest were ignored.`);
      warnedCap = true;
      continue;
    }

    const { node } = read;
    if (node.className !== undefined && node.className !== 'highlight' && !warnedClass) {
      warnings.push(`TreeView class "${node.className}" is not drawn (only "highlight" is built in; others refer to the page's stylesheet).`);
      warnedClass = true;
    }
    if (node.icon !== undefined && node.icon !== 'none') {
      const why = BUILT_IN_ICONS.has(node.icon)
        ? "Mermaid's built-in folder and file icons are not drawn yet"
        : 'TreeView icons are not drawn (they come from icon packs the page running Mermaid registers)';
      warnings.push(`${why}, ignored on "${node.label}": icon(${node.icon})`);
    }
    node.depth = stack.length;
    node.parent = stack[stack.length - 1]?.index ?? -1;
    ast.nodes.push(node);
    stack.push({ level, index: ast.nodes.length - 1 });
  }
}

/** A node from a line's text (indentation removed), or `undefined` (with a warning) when there is no name. */
function readNode(text: string, warnings: string[]): { node: TreeViewNode } | undefined {
  let name: string;
  let rest: string;
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1);
    if (end < 0) {
      warnings.push(`Unclosed quote, the name runs to the end of the line: ${text}`);
      name = text.slice(1);
      rest = '';
    } else {
      name = text.slice(1, end);
      rest = text.slice(end + 1);
    }
  } else if (/^(?::::|icon\(|##)/.test(text)) {
    warnings.push(`Unsupported line ignored (an annotation with no name before it): ${text}`);
    return undefined;
  } else {
    const stop = ANNOTATION_START.exec(text);
    name = (stop ? text.slice(0, stop.index) : text).replace(/[\t ]+$/, '');
    rest = stop ? text.slice(stop.index) : '';
  }

  const node: TreeViewNode = { label: name, isDirectory: false, highlighted: false, depth: 0, parent: -1 };
  if (name.endsWith('/')) {
    node.isDirectory = true;
    node.label = name.slice(0, -1);
  }

  while (rest.trim() !== '') {
    let m: RegExpExecArray | null;
    if ((m = CLASS_ANNOTATION.exec(rest))) {
      node.className = m[1] ?? '';
    } else if ((m = ICON_ANNOTATION.exec(rest)) && isIconName(m[1] ?? '')) {
      // `icon()` removes the icon, like `icon(none)`.
      node.icon = m[1] || 'none';
    } else if ((m = DESC_ANNOTATION.exec(rest))) {
      const description = (m[1] ?? '').trim();
      if (description) node.description = description;
      else delete node.description;
    } else {
      warnings.push(`Unrecognized text after "${node.label}" ignored: ${rest.trim()}`);
      break;
    }
    rest = rest.slice(m[0].length);
  }
  node.highlighted = node.className === 'highlight';
  return { node };
}
