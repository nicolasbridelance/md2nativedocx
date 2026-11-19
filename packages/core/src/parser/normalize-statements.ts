/**
 * Statement-ending normalisation shared by the parsers (TODO R2.1).
 *
 * Mermaid accepts several spellings of "end of statement" that the line-oriented parsers do not
 * understand on their own: a trailing `;`, several statements on one line (`A-->B; B-->C`), a `%%`
 * comment after a statement, and a byte-order mark. {@link splitStatements} turns one logical line
 * into the statements it holds, so a parser keeps its simple "one statement per line" model.
 *
 * Nothing here interprets the statement: a `;` or `%%` inside a double-quoted string or inside
 * brackets/parentheses/braces is label text and is preserved.
 */

/** Remove a leading byte-order mark (U+FEFF), which editors on Windows may prepend. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Split text into physical lines on CRLF, LF or a lone CR (old Mac line ends), after dropping a BOM.
 */
export function splitLines(text: string): string[] {
  return stripBom(text).split(/\r\n|\n|\r/);
}

/**
 * Split one logical line into its statements, dropping a trailing `%%` comment and empty statements.
 *
 * - `A-->B; B-->C;` gives `['A-->B', 'B-->C']`.
 * - `A-->B %% note` gives `['A-->B']`; a line that *starts* with `%%` (comment, `%%{init}%%`) is
 *   returned untouched so the caller's own comment handling still sees it.
 * - A `;` or `%%` inside `"..."` or inside an open `[` `(` `{` is kept as text.
 *
 * Returns `[]` for a blank line.
 *
 * `options.brackets: false` turns the bracket rule off, for a grammar where `{` `}` `(` `)` are operators
 * and not delimiters (the ER cardinalities `||--o{`).
 *
 * The sequence diagram grammar is stricter, and `sequenceDiagram` passes all four options: its message text
 * ends at the first `;` even inside quotes or brackets (`quotes: false`, `brackets: false`), keeps `%%` as
 * text (`comments: false`), and spells a literal semicolon `#59;`, an entity Mermaid decodes before it
 * parses (`entities: true` keeps every `#name;` / `#123;` whole).
 */
export function splitStatements(
  line: string,
  options: { brackets?: boolean; quotes?: boolean; comments?: boolean; entities?: boolean } = {},
): string[] {
  const trackBrackets = options.brackets !== false;
  const trackQuotes = options.quotes !== false;
  const stripComments = options.comments !== false;
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('%%')) return [trimmed];

  const statements: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (options.entities && ch === '#') {
      const entity = /^#\w+;/.exec(trimmed.slice(i));
      if (entity) {
        current += entity[0];
        i += entity[0].length - 1;
        continue;
      }
    }
    if (trackQuotes && ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (trackBrackets && (ch === '[' || ch === '(' || ch === '{')) depth++;
      else if (trackBrackets && (ch === ']' || ch === ')' || ch === '}') && depth > 0) depth--;
      else if (depth === 0) {
        if (ch === ';') {
          statements.push(current);
          current = '';
          continue;
        }
        // A trailing comment needs whitespace before it, so `-->|50%%|` style text is not cut.
        if (stripComments && ch === '%' && trimmed[i + 1] === '%' && (i === 0 || /\s/.test(trimmed[i - 1]!))) break;
      }
    }
    current += ch;
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}
