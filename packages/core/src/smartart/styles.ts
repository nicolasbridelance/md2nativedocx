/**
 * SmartArt look profiles. All three keep real SmartArt (editable, restylable from Word's SmartArt Design
 * tab); they differ in the colour and style definitions this project writes, and in how the pre-rendered
 * `dsp:drawing` (`drawing.ts`) paints the shapes so the cached rendering and Word's own agree:
 *
 * - `simple`   — one accent, flat fill: the original look (default, unchanged).
 * - `colorful` — a different theme accent per shape (accent 2..6 repeating, like Word's "Colorful –
 *   Accent Colors"), white outline.
 * - `intense`  — `colorful` plus the theme's gradient fill, drop shadow and a heavier outline, the way
 *   Word's "Intense Effect" quick style references the theme's third fill/effect style.
 *
 * Definitions are written from the public ECMA-376 schema (ADR 0004 "Round 5": nothing is copied from a
 * Word-emitted file). Every colour is a theme reference (`a:schemeClr`), so the diagram follows the
 * document's theme and accent colour setting.
 */

/**
 * One look profile: which accents shapes use (`palette`) and which theme line / fill / effect style they
 * reference, as Word's own quick styles do (`lnRef`/`fillRef`/`effectRef` indexes into the document theme's
 * 3 line styles, 3 fills — 3 = gradient — and 3 effects — 2 = drop shadow).
 */
export interface StyleProfile {
  /** `single`: accent 1 (accent 2 for children); `colorful`: a different accent per shape. */
  palette: 'single' | 'colorful';
  /** Theme line style of node shapes (0 = none, so the outline is invisible). */
  lnIdx: 0 | 2;
  /** Theme fill style: 1 flat, 2 soft gradient, 3 gradient (intense). */
  fillIdx: 1 | 2 | 3;
  /** Theme effect style: 0 none, 1 light shadow, 2 drop shadow. */
  effectIdx: 0 | 1 | 2;
  /** Outline width of node shapes in the cached drawing (EMU). */
  lineW: number;
}

/** Every look profile, by name (the order is the order shown in settings). */
export const STYLE_PROFILES = {
  simple: { palette: 'single', lnIdx: 0, fillIdx: 1, effectIdx: 0, lineW: 12700 },
  subtle: { palette: 'single', lnIdx: 2, fillIdx: 1, effectIdx: 0, lineW: 19050 },
  moderate: { palette: 'single', lnIdx: 2, fillIdx: 2, effectIdx: 1, lineW: 19050 },
  'intense-accent': { palette: 'single', lnIdx: 2, fillIdx: 3, effectIdx: 2, lineW: 25400 },
  colorful: { palette: 'colorful', lnIdx: 2, fillIdx: 1, effectIdx: 0, lineW: 19050 },
  'colorful-moderate': { palette: 'colorful', lnIdx: 2, fillIdx: 2, effectIdx: 1, lineW: 19050 },
  intense: { palette: 'colorful', lnIdx: 2, fillIdx: 3, effectIdx: 2, lineW: 25400 },
} as const satisfies Record<string, StyleProfile>;

/** Look profile of a SmartArt diagram (a key of {@link STYLE_PROFILES}). */
export type SmartArtStyle = keyof typeof STYLE_PROFILES;

/** Every accepted profile name, for validating user input (settings, environment variables). */
export const SMARTART_STYLES = Object.keys(STYLE_PROFILES) as SmartArtStyle[];

/** The profile named `style`. */
export function profileOf(style: SmartArtStyle): StyleProfile {
  return STYLE_PROFILES[style];
}

/** Style labels this project's layouts use. */
export type StyleLabel = 'node0' | 'node1' | 'node2' | 'sibTrans' | 'parChTrans1D2' | 'card';

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const ACCENT_CYCLE = ['accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
const CHILD_ACCENT_CYCLE = ['accent3', 'accent4', 'accent5', 'accent6', 'accent2'];

/** Theme accent the `index`-th shape of `label` is painted with. */
export function accentOf(style: SmartArtStyle, label: StyleLabel, index: number): string {
  // A parent-to-child connector takes the root's accent (its line is that accent, darkened).
  if (label === 'parChTrans1D2') return accentOf(style, 'node1', 0);
  if (profileOf(style).palette === 'single') return label === 'node2' ? 'accent2' : 'accent1';
  const cycle = label === 'node2' ? CHILD_ACCENT_CYCLE : ACCENT_CYCLE;
  return cycle[index % cycle.length] as string;
}

/** The accents `label` cycles through, in order (for `meth="repeat"` colour lists). */
function accentList(style: SmartArtStyle, label: StyleLabel): string[] {
  const n = profileOf(style).palette === 'single' ? 1 : (label === 'node2' ? CHILD_ACCENT_CYCLE : ACCENT_CYCLE).length;
  return Array.from({ length: n }, (_, i) => accentOf(style, label, i));
}

const clr = (accent: string, tintPercent?: number) =>
  tintPercent === undefined
    ? `<a:schemeClr val="${accent}"/>`
    : `<a:schemeClr val="${accent}"><a:tint val="${tintPercent * 1000}"/></a:schemeClr>`;

/** `parChTrans1D2` colours: no fill, a line in the root's accent darkened to 60% (how a real Word tree draws it). */
export function connColorsDef(style: SmartArtStyle): string {
  const accent = accentOf(style, 'parChTrans1D2', 0);
  return (
    '<dgm:styleLbl name="parChTrans1D2">' +
    `<dgm:fillClrLst meth="repeat">${clr(accent)}</dgm:fillClrLst>` +
    `<dgm:linClrLst meth="repeat"><a:schemeClr val="${accent}"><a:shade val="60000"/></a:schemeClr></dgm:linClrLst>` +
    '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
    '<dgm:txFillClrLst meth="repeat"><a:schemeClr val="tx1"/></dgm:txFillClrLst><dgm:txEffectClrLst/></dgm:styleLbl>'
  );
}

/** `parChTrans1D2` quick style: a 2nd-level theme line, no fill, no effect. */
export const CONN_STYLE_DEF =
  '<dgm:styleLbl name="parChTrans1D2"><dgm:style>' +
  '<a:lnRef idx="2"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"/>' +
  '</dgm:style></dgm:styleLbl>';

/** `card` colours: a neutral light-grey card with a soft grey outline and dark text, in every profile. */
export const CARD_COLORS_DEF =
  '<dgm:styleLbl name="card">' +
  '<dgm:fillClrLst meth="repeat"><a:schemeClr val="lt1"><a:lumMod val="95000"/></a:schemeClr></dgm:fillClrLst>' +
  '<dgm:linClrLst meth="repeat"><a:schemeClr val="tx1"><a:lumMod val="25000"/><a:lumOff val="75000"/></a:schemeClr></dgm:linClrLst>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
  '<dgm:txFillClrLst meth="repeat"><a:schemeClr val="tx1"/></dgm:txFillClrLst><dgm:txEffectClrLst/></dgm:styleLbl>';

/** `card` quick style: the theme's thin line, plain fill, no effect. */
export const CARD_STYLE_DEF =
  '<dgm:styleLbl name="card"><dgm:style>' +
  '<a:lnRef idx="1"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="1"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>' +
  '</dgm:style></dgm:styleLbl>';

/**
 * `dgm:colorsDef` for the non-default profiles. `uniqueId` must equal the `csTypeId` the data model
 * references. (`simple` keeps each generator's own original constant.)
 */
export function buildColorsXml(style: SmartArtStyle, uniqueId: string, labels: StyleLabel[]): string {
  const defs = labels
    .map((label) => {
      if (label === 'parChTrans1D2') return connColorsDef(style);
      if (label === 'card') return CARD_COLORS_DEF;
      const isTrans = label === 'sibTrans';
      const accents = accentList(style, label);
      const fill = accents.map((a) => clr(a, isTrans ? 60 : undefined)).join('');
      return (
        `<dgm:styleLbl name="${label}">` +
        `<dgm:fillClrLst meth="repeat">${fill}</dgm:fillClrLst>` +
        '<dgm:linClrLst meth="repeat"><a:schemeClr val="lt1"/></dgm:linClrLst>' +
        '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
        `<dgm:txFillClrLst meth="repeat"><a:schemeClr val="${isTrans ? 'tx1' : 'lt1'}"/></dgm:txFillClrLst>` +
        '<dgm:txEffectClrLst/></dgm:styleLbl>'
      );
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:colorsDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${uniqueId}" minVer="12.0">` +
    '<dgm:title val=""/><dgm:desc val=""/>' +
    `<dgm:catLst><dgm:cat type="${profileOf(style).palette === 'single' ? 'accent1' : 'colorful'}" pri="10100"/></dgm:catLst>` +
    defs +
    '</dgm:colorsDef>'
  );
}

/**
 * `dgm:styleDef` for the non-default profiles: references to the theme's line/fill/effect styles
 * (`lnRef`/`fillRef`/`effectRef` indexes), which is how Word's own quick styles work. `intense` points at
 * the theme's third fill (gradient) and second effect (drop shadow). `uniqueId` must equal the `qsTypeId`
 * the data model references.
 */
export function buildStyleXml(style: SmartArtStyle, uniqueId: string, labels: StyleLabel[]): string {
  const { lnIdx, fillIdx, effectIdx } = profileOf(style);
  const defs = labels
    .map((label) => {
      if (label === 'parChTrans1D2') return CONN_STYLE_DEF;
      if (label === 'card') return CARD_STYLE_DEF;
      const isTrans = label === 'sibTrans';
      const ln = isTrans ? 0 : lnIdx;
      const fill = isTrans ? 1 : fillIdx;
      const effect = isTrans ? 0 : effectIdx;
      return (
        `<dgm:styleLbl name="${label}"><dgm:style>` +
        `<a:lnRef idx="${ln}"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef>` +
        `<a:fillRef idx="${fill}"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef>` +
        `<a:effectRef idx="${effect}"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef>` +
        `<a:fontRef idx="minor"><a:schemeClr val="${isTrans ? 'tx1' : 'lt1'}"/></a:fontRef>` +
        '</dgm:style></dgm:styleLbl>'
      );
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:styleDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${uniqueId}" minVer="12.0">` +
    '<dgm:title val=""/><dgm:desc val=""/>' +
    '<dgm:catLst><dgm:cat type="simple" pri="10100"/></dgm:catLst>' +
    defs +
    '</dgm:styleDef>'
  );
}
