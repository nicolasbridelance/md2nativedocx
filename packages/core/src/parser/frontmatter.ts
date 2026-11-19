/**
 * Mermaid's YAML frontmatter, handled once for every diagram type (TODO §2, "Conformité Mermaid").
 *
 * Mermaid reads a leading `---` … `---` block before it looks at the diagram itself, whatever the type:
 * `title:` names the diagram, `config:` carries theme and layout options (and `displayMode:` a Gantt
 * option). The parsers used to meet those lines as diagram statements and report them as unsupported.
 * {@link prepareSource} removes the block, turns `title:` into the type's own `title` statement when it
 * has one, and reports what is not applied.
 */

import type { DiagramType } from './diagram-type.js';

/** The frontmatter block split from the diagram. */
export interface Frontmatter {
  /** The diagram without its frontmatter (the source unchanged when there is none). */
  body: string;
  /** `title:`, unquoted; `undefined` when absent or empty. */
  title?: string;
  /** Whether any key other than `title` is set (`config:`, `displayMode:`…). */
  hasOptions: boolean;
}

/** Mermaid's own pattern: `---` on the first line, YAML, `---` on a line of its own. */
const FRONTMATTER = /^﻿?\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Split the YAML frontmatter from `source`. Only top-level keys are read; nothing is evaluated. */
export function splitFrontmatter(source: string): Frontmatter {
  const match = FRONTMATTER.exec(source);
  if (!match) return { body: source, hasOptions: false };
  const yaml = match[1] ?? '';
  const titleLine = /^title:[ \t]*(.*)$/m.exec(yaml);
  const title = titleLine ? unquote((titleLine[1] ?? '').trim()) : undefined;
  const hasOptions = /^(?!title:)[A-Za-z_][\w-]*:/m.test(yaml);
  return { body: source.slice(match[0].length), ...(title ? { title } : {}), hasOptions };
}

function unquote(value: string): string {
  const q = value[0];
  return (q === '"' || q === "'") && value.endsWith(q) && value.length >= 2 ? value.slice(1, -1) : value;
}

/** Types whose grammar has a `title …` statement, so a frontmatter title can become one. */
const TITLE_STATEMENT: ReadonlySet<DiagramType> = new Set<DiagramType>([
  'c4', 'cynefin', 'gantt', 'gitGraph', 'journey', 'packet', 'pie', 'quadrant', 'radar', 'sequence',
  'timeline', 'venn', 'wardley', 'xychart', 'zenuml',
]);

/**
 * The source a parser should see for `type`, and the warnings frontmatter handling produced.
 *
 * - No frontmatter: `source` unchanged, no warning.
 * - `title:` on a type with a `title` statement and none in the body: inserted after the header line.
 *   On another type, a warning (the title is not drawn).
 * - Any other key: a notice that frontmatter options (theme, colours, layout) are not applied; the
 *   Word output uses the document's own look.
 */
export function prepareSource(source: string, type: DiagramType): { source: string; warnings: string[] } {
  const fm = splitFrontmatter(source);
  if (fm.body === source) return { source, warnings: [] };
  const warnings: string[] = [];
  let body = fm.body;
  if (fm.title !== undefined) {
    const lines = body.split(/\r?\n/);
    const header = lines.findIndex((l) => l.trim() !== '' && !l.trim().startsWith('%%'));
    const hasTitle = lines.some((l, i) => i > header && /^\s*title\b/i.test(l));
    if (!TITLE_STATEMENT.has(type)) {
      warnings.push(`The frontmatter title "${fm.title}" is not drawn for this diagram type.`);
    } else if (header !== -1 && !hasTitle) {
      lines.splice(header + 1, 0, `title ${fm.title.replace(/[\r\n]+/g, ' ')}`);
      body = lines.join('\n');
    }
  }
  if (fm.hasOptions) {
    warnings.push('Frontmatter options (theme, colours, layout) are not applied: the Word output uses the document\'s own look.');
  }
  return { source: body, warnings };
}
