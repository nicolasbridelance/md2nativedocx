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
 */
export function splitStatements(line: string, options: { brackets?: boolean } = {}): string[] {
  const trackBrackets = options.brackets !== false;
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('%%')) return [trimmed];

  const statements: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === '"') {
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
        if (ch === '%' && trimmed[i + 1] === '%' && (i === 0 || /\s/.test(trimmed[i - 1]!))) break;
      }
    }
    current += ch;
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}
