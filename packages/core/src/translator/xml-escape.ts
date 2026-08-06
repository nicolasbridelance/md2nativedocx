/**
 * Strict XML escaping for user-controlled text (AGENTS.md rule #2).
 *
 * Every string that originates from untrusted Mermaid/Markdown text — node
 * labels, edge labels, subgraph titles — MUST pass through {@link escapeXml}
 * before being written into an `<a:t>` run or any XML attribute. This is
 * non-negotiable: the input may be AI-generated on someone else's behalf and
 * cannot be assumed well-formed.
 *
 * Escapes the five XML-significant characters: `& < > " '`.
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
  return input.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch);
}
