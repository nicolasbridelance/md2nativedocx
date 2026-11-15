/**
 * Strict XML escaping for user-controlled text (AGENTS.md rule #2).
 *
 * Every string that originates from untrusted Mermaid/Markdown text — node
 * labels, edge labels, subgraph titles — MUST pass through {@link escapeXml}
 * before being written into an `<a:t>` run or any XML attribute. This is
 * non-negotiable: the input may be AI-generated on someone else's behalf and
 * cannot be assumed well-formed.
 *
 * Escapes the five XML-significant characters: `& < > " '`, and replaces the
 * characters XML 1.0 forbids outright with U+FFFD.
 */

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * Escape a user-controlled string for safe insertion into XML text or an
 * attribute value.
 *
 * @param input - The raw, untrusted string.
 * @returns The string with all XML-significant characters replaced by entities.
 */
export function escapeXml(input: string): string {
  return input.replace(XML_ILLEGAL_CHARS, '�').replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch);
}

/**
 * Characters that XML 1.0 forbids even as character references: C0 controls
 * other than TAB/LF/CR, U+FFFE/U+FFFF, and lone surrogates. Entity escaping
 * cannot fix them (`&#1;` is just as illegal), so a label carrying one would
 * make the whole part ill-formed and Word would refuse the file. They are
 * replaced by U+FFFD instead.
 */
const XML_ILLEGAL_CHARS =
  // eslint-disable-next-line no-control-regex -- matching control characters is the whole point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Validate a hex color string before it reaches an `a:srgbClr val="..."`
 * attribute. Colors are structured data (`classDef fill:#RRGGBB`), not free
 * text, so `escapeXml` alone isn't the right guard — a malformed or
 * attacker-controlled value here could break out of the attribute. Returns
 * the uppercased 6-digit hex on success, `fallback` otherwise. Mirrors
 * `ooxml-translator.ts`'s private `hexColor` helper for the same reason.
 */
export function validateHexColor(value: string | undefined, fallback: string): string {
  return value !== undefined && /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}
