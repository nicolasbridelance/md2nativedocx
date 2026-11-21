/**
 * Mermaid's CSS-like style lists (`classDef`, `style`, `linkStyle`), read the same way for every diagram
 * that takes them: a flowchart, a class diagram and a state diagram. Only `fill`, `stroke` and `color` with a
 * hex value are kept, so nothing but a validated colour can reach the XML (AGENTS.md rule 2), and
 * `font-weight` / `font-style` as booleans (read by the state diagram only, for now).
 */

/**
 * Parse a CSS-like `prop:value,prop:value` property list (`classDef`/`style`/
 * `linkStyle`, spec §6.3) into a lowercase-keyed map. Order-independent by
 * design — unlike the old `classDef` regex this replaces, which required
 * `fill:` to be the first (and only) property, silently failing the whole
 * line otherwise. Values that themselves contain a comma (e.g. a
 * `stroke-dasharray` list) will fragment here, but none of the properties
 * this parser actually reads (`fill`, `stroke`, `stroke-width`) are affected.
 */
export function parseCssStyleProps(text: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const part of text.split(',')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (key.length > 0 && value.length > 0) props.set(key, value);
  }
  return props;
}

/**
 * Normalize a CSS color value to a bare 6-digit uppercase hex string (what
 * the translator's `hexColor()` expects), expanding the 3-digit shorthand
 * (`#f9f` -> `FF99FF`). Returns `null` for anything else (a named color like
 * `red`, `transparent`, a `rgb(...)` call, ...) — deliberately out of scope,
 * same tolerant-degradation style as an unrecognized `@{shape: ...}` name:
 * the property is just dropped rather than failing the whole statement.
 */
export function parseHexColor(value: string): string | null {
  const v = value.trim();
  const hex6 = v.match(/^#?([0-9A-Fa-f]{6})$/);
  if (hex6) return hex6[1]!.toUpperCase();
  const hex3 = v.match(/^#?([0-9A-Fa-f]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1]!;
    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

/** The subset of `fill`/`stroke` CSS properties this parser maps to OOXML. */
export interface NodeStylePatch {
  fill?: string;
  stroke?: string;
  color?: string;
  /** `font-weight: bold` (or `bolder`, or a weight of 600 and up); `false` for `normal` and lighter. */
  bold?: boolean;
  /** `font-style: italic` (or `oblique`); `false` for `normal`. */
  italic?: boolean;
}

/** Extract `fill`/`stroke`/`color` from a parsed property map, dropping anything not
 * a recognized hex color (see {@link parseHexColor}). */
export function extractNodeStyle(props: Map<string, string>): NodeStylePatch {
  const patch: NodeStylePatch = {};
  const fillValue = props.get('fill');
  if (fillValue) {
    const hex = parseHexColor(fillValue);
    if (hex) patch.fill = hex;
  }
  const strokeValue = props.get('stroke');
  if (strokeValue) {
    const hex = parseHexColor(strokeValue);
    if (hex) patch.stroke = hex;
  }
  const colorValue = props.get('color');
  if (colorValue) {
    const hex = parseHexColor(colorValue);
    if (hex) patch.color = hex;
  }
  const weight = props.get('font-weight')?.toLowerCase();
  if (weight !== undefined) {
    const numeric = Number(weight);
    if (weight === 'bold' || weight === 'bolder' || (Number.isFinite(numeric) && numeric >= 600)) patch.bold = true;
    else if (weight === 'normal' || weight === 'lighter' || Number.isFinite(numeric)) patch.bold = false;
  }
  const fontStyle = props.get('font-style')?.toLowerCase();
  if (fontStyle === 'italic' || fontStyle === 'oblique') patch.italic = true;
  else if (fontStyle === 'normal') patch.italic = false;
  return patch;
}
