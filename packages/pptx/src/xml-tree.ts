/**
 * Minimal, XXE-safe XML tree helpers over `fast-xml-parser` (preserveOrder mode).
 *
 * Security (AGENTS.md rule #5): any DTD/entity declaration is rejected before
 * parsing, and entity processing is disabled — text and attribute values stay
 * exactly as the (already XML-escaped) producer wrote them, so the round trip
 * never decodes and never re-encodes user text.
 */

import { XMLParser } from 'fast-xml-parser';
import { PptxConversionError } from './errors.js';

/** A parsed element: `{ 'tag': [children], ':@': { '@_attr': 'value' } }`, or a `{ '#text': ... }` node. */
export type XNode = Record<string, unknown>;

const ATTR_KEY = ':@';
const ATTR_PREFIX = '@_';

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  ignoreDeclaration: true,
});

/** Parse an XML fragment (possibly several root elements). Rejects DTDs and entity declarations. */
export function parseFragment(xml: string): XNode[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new PptxConversionError('DTD / entity declarations are not allowed in generated drawing XML');
  }
  return parser.parse(`<root>${xml}</root>`) as XNode[];
}

/** The element's tag name, or `#text` for a text node. */
export function tagOf(node: XNode): string {
  for (const key of Object.keys(node)) if (key !== ATTR_KEY) return key;
  return '';
}

/** Child nodes (empty for text nodes). */
export function kids(node: XNode): XNode[] {
  const value = node[tagOf(node)];
  return Array.isArray(value) ? (value as XNode[]) : [];
}

/** Attributes without the parser's prefix. */
export function attrsOf(node: XNode): Record<string, string> {
  const raw = (node[ATTR_KEY] ?? {}) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[k.slice(ATTR_PREFIX.length)] = String(v);
  return out;
}

/** First direct child with the given tag. */
export function child(node: XNode, tag: string): XNode | undefined {
  return kids(node).find((k) => tagOf(k) === tag);
}

/** Every direct child with the given tag. */
export function childrenNamed(node: XNode, tag: string): XNode[] {
  return kids(node).filter((k) => tagOf(k) === tag);
}

/** Depth-first search, in document order, for every descendant with the given tag. */
export function descendants(node: XNode, tag: string): XNode[] {
  const out: XNode[] = [];
  for (const k of kids(node)) {
    if (tagOf(k) === tag) out.push(k);
    out.push(...descendants(k, tag));
  }
  return out;
}

/** Raw (still escaped) concatenated text of a node's direct text children. */
export function rawText(node: XNode): string {
  return kids(node)
    .filter((k) => tagOf(k) === '#text')
    .map((k) => String(k['#text'] ?? ''))
    .join('');
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Serialize a node, optionally renaming its tag and overriding attributes. Text is emitted verbatim. */
export function serialize(
  node: XNode,
  options: { rename?: string; attrs?: Record<string, string> } = {},
): string {
  const tag = tagOf(node);
  if (tag === '#text') return String(node['#text'] ?? '');
  const name = options.rename ?? tag;
  const attrs = { ...attrsOf(node), ...(options.attrs ?? {}) };
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  const inner = kids(node)
    .filter((k) => tagOf(k) !== '#text' || String(k['#text'] ?? '').trim() !== '' || tag === 'w:t' || tag === 'a:t')
    .map((k) => serialize(k))
    .join('');
  return inner === '' ? `<${name}${attrText}/>` : `<${name}${attrText}>${inner}</${name}>`;
}
