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

/** Look profile of a SmartArt diagram. */
export type SmartArtStyle = 'simple' | 'colorful' | 'intense';

/** Style labels this project's layouts use. */
export type StyleLabel = 'node0' | 'node1' | 'node2' | 'sibTrans';

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const ACCENT_CYCLE = ['accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
const CHILD_ACCENT_CYCLE = ['accent3', 'accent4', 'accent5', 'accent6', 'accent2'];

/** Theme accent the `index`-th shape of `label` is painted with. */
export function accentOf(style: SmartArtStyle, label: StyleLabel, index: number): string {
  if (style === 'simple') return label === 'node2' ? 'accent2' : 'accent1';
  const cycle = label === 'node2' ? CHILD_ACCENT_CYCLE : ACCENT_CYCLE;
  return cycle[index % cycle.length] as string;
}

/** The accents `label` cycles through, in order (for `meth="repeat"` colour lists). */
function accentList(style: SmartArtStyle, label: StyleLabel): string[] {
  const n = style === 'simple' ? 1 : (label === 'node2' ? CHILD_ACCENT_CYCLE : ACCENT_CYCLE).length;
  return Array.from({ length: n }, (_, i) => accentOf(style, label, i));
}

const clr = (accent: string, tintPercent?: number) =>
  tintPercent === undefined
    ? `<a:schemeClr val="${accent}"/>`
    : `<a:schemeClr val="${accent}"><a:tint val="${tintPercent * 1000}"/></a:schemeClr>`;

/**
 * `dgm:colorsDef` for the non-default profiles. `uniqueId` must equal the `csTypeId` the data model
 * references. (`simple` keeps each generator's own original constant.)
 */
export function buildColorsXml(style: SmartArtStyle, uniqueId: string, labels: StyleLabel[]): string {
  const defs = labels
    .map((label) => {
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
    '<dgm:catLst><dgm:cat type="colorful" pri="10100"/></dgm:catLst>' +
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
  const intense = style === 'intense';
  const defs = labels
    .map((label) => {
      const isTrans = label === 'sibTrans';
      const ln = isTrans ? 0 : 2;
      const fill = isTrans ? 1 : intense ? 3 : 1;
      const effect = isTrans ? 0 : intense ? 2 : 0;
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

/** Whether the profile paints shapes with the theme's gradient + shadow in the cached drawing. */
export function isIntense(style: SmartArtStyle): boolean {
  return style === 'intense';
}
