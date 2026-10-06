/**
 * SmartArt generator for a Mermaid `timeline`: a real time line, not a process. A wide arrow runs across the
 * whole diagram (the time axis), a dot sits on it for each period, and each period's box — the period in bold,
 * then one line per event — stands above or below its dot, alternately, so a box can be wider than its share
 * of the axis without touching the next box on the same side.
 *
 * Like every generator in this folder, the five parts are original (`docs/adr/0004-smartart-feasibility-spike.md`
 * "Round 5": never Word's own layout XML). The `layoutDef` is self-authored from the public algorithms
 * (`composite`, `lin`, `tx`, `sp`, ECMA-376 §21.4.2) and alternates sides with a `choose` on the period's
 * position (`func="posOdd"`). Its geometry depends on the number of periods (how much each box may overhang
 * its slot), so each count gets its own `uniqueId` (`timeline1-n5`…): a document keeps one definition per id.
 *
 * Data model: one content point per period under the `doc` point, in order — adding a period in Word's Text
 * Pane adds a dot and a box. Events are line breaks inside the period's text (`text.ts`), not child points.
 */

import type { LabelToken } from '../types.js';
import type { TimelineChart } from '../diagrams/timeline/types.js';
import { DRAWING_EXT_LST_XML, buildDiagramDrawingXml, fitFontSize, textFits, type DrawingShape } from './drawing.js';
import { accentOf, buildColorsXml, buildStyleXml, type SmartArtStyle, type StyleLabel } from './styles.js';
import { pointTextXml, textLines } from './text.js';
import type { SmartArtGenerateOptions } from './generate-options.js';

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** `layoutDef` URN prefix; the period count is appended (`…/timeline1-n4`). */
export const TIMELINE_LAYOUT_URN_PREFIX = 'urn:md2nativedocx/smartart-layout/timeline1';
const COLORS_URN = 'urn:md2nativedocx/smartart-colors/timeline1';
const STYLE_URN = 'urn:md2nativedocx/smartart-quickstyle/timeline1';
const LABELS: StyleLabel[] = ['node1', 'sibTrans'];

/** Diagram width (EMU): the same 6-inch frame as the other generators. */
const FRAME_CX = 5486400;
/** Fractions of the diagram height: axis thickness, dot diameter, box height (above: from the top; below: to the bottom). */
const AXIS_H = 0.08;
const DOT = 0.12;
const BOX_H = 0.4;
const EMU_PER_PT = 12700;

/** The four-plus-one parts of a timeline SmartArt, and the frame to embed it in. */
export interface SmartArtTimelineOutput {
  dataXml: string;
  layoutXml: string;
  colorsXml: string;
  styleXml: string;
  drawingXml?: string;
  frame: { cx: number; cy: number };
}

/** How many slots wide a box is: 1.8 (neighbours on the same side are two slots apart), 1 for two periods. */
function overhang(n: number): number {
  return n >= 3 ? 1.8 : 1;
}

/** Width of the band the dots are spread over, as a fraction of the diagram, so the outer boxes stay inside. */
function bandFraction(n: number): number {
  return 1 / (1 + (overhang(n) - 1) / n);
}

/** Bold period line(s), then one plain line per event. */
export function periodText(label: string, events: string[]): LabelToken[] {
  const tokens: LabelToken[] = [];
  label.split('\n').forEach((line, i) => {
    if (i > 0) tokens.push({ break: true });
    tokens.push({ text: line, bold: true });
  });
  for (const event of events) {
    for (const line of event.split('\n')) tokens.push({ break: true }, { text: line });
  }
  return tokens;
}

/** Diagram height (EMU) for boxes of `lines` lines at about 14 pt: between 1.25 and 3.5 inches. */
function frameHeight(lines: number): number {
  const boxPt = lines * 14 * 1.25 + 16;
  return Math.round(Math.min(3.5 * 914400, Math.max(1.25 * 914400, ((boxPt / BOX_H) * EMU_PER_PT))));
}

/** The original `dgm:layoutDef` for `n` periods. */
export function timelineLayoutXml(n: number): string {
  const band = bandFraction(n);
  const inset = (1 - band) / 2;
  const box = overhang(n);
  const boxConstr = (top: boolean) =>
    '<dgm:constrLst>' +
    `<dgm:constr type="w" for="ch" forName="dot" refType="h" fact="${DOT}"/>` +
    `<dgm:constr type="h" for="ch" forName="dot" refType="h" fact="${DOT}"/>` +
    '<dgm:constr type="ctrX" for="ch" forName="dot" refType="w" fact="0.5"/>' +
    '<dgm:constr type="ctrY" for="ch" forName="dot" refType="h" fact="0.5"/>' +
    `<dgm:constr type="w" for="ch" forName="text" refType="w" fact="${box}"/>` +
    `<dgm:constr type="h" for="ch" forName="text" refType="h" fact="${BOX_H}"/>` +
    '<dgm:constr type="ctrX" for="ch" forName="text" refType="w" fact="0.5"/>' +
    (top
      ? '<dgm:constr type="t" for="ch" forName="text" val="0"/>'
      : `<dgm:constr type="t" for="ch" forName="text" refType="h" fact="${(1 - BOX_H).toFixed(2)}"/>`) +
    '</dgm:constrLst>';
  const margins =
    '<dgm:constrLst>' +
    '<dgm:constr type="lMarg" refType="primFontSz" fact="0.15"/><dgm:constr type="rMarg" refType="primFontSz" fact="0.15"/>' +
    '<dgm:constr type="tMarg" refType="primFontSz" fact="0.1"/><dgm:constr type="bMarg" refType="primFontSz" fact="0.1"/>' +
    '</dgm:constrLst>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${TIMELINE_LAYOUT_URN_PREFIX}-n${n}">` +
    '<dgm:title val=""/><dgm:desc val=""/>' +
    '<dgm:catLst><dgm:cat type="process" pri="1"/></dgm:catLst>' +
    '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
    '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
    '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
    '<dgm:layoutNode name="root">' +
    '<dgm:alg type="composite"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="16"/>' +
    '<dgm:constr type="l" for="ch" forName="axis" val="0"/>' +
    '<dgm:constr type="w" for="ch" forName="axis" refType="w"/>' +
    `<dgm:constr type="h" for="ch" forName="axis" refType="h" fact="${AXIS_H}"/>` +
    '<dgm:constr type="ctrY" for="ch" forName="axis" refType="h" fact="0.5"/>' +
    `<dgm:constr type="l" for="ch" forName="periods" refType="w" fact="${inset.toFixed(4)}"/>` +
    `<dgm:constr type="w" for="ch" forName="periods" refType="w" fact="${band.toFixed(4)}"/>` +
    '<dgm:constr type="t" for="ch" forName="periods" val="0"/>' +
    '<dgm:constr type="h" for="ch" forName="periods" refType="h"/>' +
    '</dgm:constrLst>' +
    // The axis: drawn first, so the dots and boxes sit on top of it. Presents the `doc` point (no text).
    '<dgm:layoutNode name="axis" styleLbl="sibTrans">' +
    '<dgm:alg type="sp"/><dgm:shape type="rightArrow"><dgm:adjLst/></dgm:shape>' +
    '<dgm:presOf/>' +
    '</dgm:layoutNode>' +
    '<dgm:layoutNode name="periods">' +
    '<dgm:alg type="lin"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    '<dgm:constr type="w" for="ch" forName="period" refType="w"/>' +
    '<dgm:constr type="h" for="ch" forName="period" refType="h"/>' +
    '<dgm:constr op="equ" type="sp" val="0"/>' +
    '</dgm:constrLst>' +
    '<dgm:forEach name="periodForEach" axis="ch" ptType="node">' +
    '<dgm:layoutNode name="period">' +
    '<dgm:alg type="composite"/><dgm:shape/>' +
    // Odd positions (the 1st, 3rd…) above the axis, even ones below.
    '<dgm:choose name="side">' +
    `<dgm:if name="above" axis="self" func="posOdd" op="equ" val="1">${boxConstr(true)}</dgm:if>` +
    `<dgm:else name="below">${boxConstr(false)}</dgm:else>` +
    '</dgm:choose>' +
    '<dgm:layoutNode name="dot" styleLbl="node1">' +
    '<dgm:alg type="sp"/><dgm:shape type="ellipse"/>' +
    '<dgm:presOf/>' +
    '</dgm:layoutNode>' +
    '<dgm:layoutNode name="text" styleLbl="node1">' +
    '<dgm:alg type="tx"/><dgm:shape type="roundRect"/>' +
    '<dgm:presOf axis="self" ptType="node"/>' +
    margins +
    '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutNode>' +
    '</dgm:forEach>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutDef>'
  );
}

interface Geometry {
  frame: { cx: number; cy: number };
  centres: number[];
  boxW: number;
  boxH: number;
  dot: number;
}

function geometry(texts: LabelToken[][]): Geometry {
  const n = texts.length;
  const cy = frameHeight(Math.max(...texts.map((t) => textLines(t).length)));
  const band = bandFraction(n) * FRAME_CX;
  const slot = band / n;
  const inset = (FRAME_CX - band) / 2;
  return {
    frame: { cx: FRAME_CX, cy },
    centres: texts.map((_, i) => inset + slot * (i + 0.5)),
    boxW: overhang(n) * slot,
    boxH: BOX_H * cy,
    dot: DOT * cy,
  };
}

/**
 * Whether the periods' boxes keep their words whole at 10 pt or more. When they don't (many periods with long
 * words), a caller keeps the shape-built timeline.
 */
export function timelineTextFits(chart: TimelineChart): boolean {
  if (chart.periods.length < 2) return false;
  const texts = chart.periods.map((p) => periodText(p.label, p.events));
  const g = geometry(texts);
  return textFits(texts, g.boxW, g.boxH, 10);
}

/**
 * Generate the parts of a timeline SmartArt for `chart`. The caller checks eligibility first (at least two
 * periods, no section, {@link timelineTextFits}); sections and the title are not represented here.
 */
export function generateTimeline(chart: TimelineChart, options: SmartArtGenerateOptions = {}): SmartArtTimelineOutput {
  const style: SmartArtStyle = options.style ?? 'simple';
  const n = chart.periods.length;
  const texts = chart.periods.map((p) => periodText(p.label, p.events));
  const layoutUrn = `${TIMELINE_LAYOUT_URN_PREFIX}-n${n}`;

  // Model ids are plain unsigned integers (ST_ModelId, ECMA-376 §21.4) from one counter.
  let next = 0;
  const newId = (): string => String(next++);
  const docId = newId();
  const nodeIds = texts.map(() => newId());
  const parOfIds = texts.map(() => newId());
  const parTransIds = texts.map(() => newId());
  const sibTransIds = texts.map(() => newId());
  const pRoot = newId();
  const pAxis = newId();
  const pPeriods = newId();
  const pPeriod = texts.map(() => newId());
  const pDot = texts.map(() => newId());
  const pText = texts.map(() => newId());

  const contentPts = texts
    .map(
      (text, i) =>
        `<dgm:pt modelId="${nodeIds[i]}"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/>${pointTextXml(text)}</dgm:pt>` +
        `<dgm:pt modelId="${parTransIds[i]}" type="parTrans" cxnId="${parOfIds[i]}"><dgm:prSet/><dgm:spPr/></dgm:pt>` +
        `<dgm:pt modelId="${sibTransIds[i]}" type="sibTrans" cxnId="${parOfIds[i]}"><dgm:prSet/><dgm:spPr/></dgm:pt>`
    )
    .join('');
  const pres = (id: string, assoc: string, name: string, extra = '') =>
    `<dgm:pt modelId="${id}" type="pres"><dgm:prSet presAssocID="${assoc}" presName="${name}"${extra}/><dgm:spPr/></dgm:pt>`;
  const presPts =
    pres(pRoot, docId, 'root', ' presStyleCnt="0"') +
    pres(pAxis, docId, 'axis', ' presStyleLbl="sibTrans" presStyleIdx="0" presStyleCnt="1"') +
    pres(pPeriods, docId, 'periods', ' presStyleCnt="0"') +
    texts
      .map(
        (_, i) =>
          pres(pPeriod[i] as string, nodeIds[i] as string, 'period', ' presStyleCnt="0"') +
          pres(pDot[i] as string, nodeIds[i] as string, 'dot', ` presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${n}"`) +
          pres(pText[i] as string, nodeIds[i] as string, 'text', ` presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${n}"`)
      )
      .join('');

  const cxn = (type: string, src: string, dest: string, srcOrd: number, extra = '') =>
    `<dgm:cxn modelId="${newId()}" type="${type}" srcId="${src}" destId="${dest}" srcOrd="${srcOrd}" destOrd="0"${extra}/>`;
  const parOf = texts
    .map(
      (_, i) =>
        `<dgm:cxn modelId="${parOfIds[i]}" type="parOf" srcId="${docId}" destId="${nodeIds[i]}" srcOrd="${i}" destOrd="0" ` +
        `parTransId="${parTransIds[i]}" sibTransId="${sibTransIds[i]}"/>`
    )
    .join('');
  const presId = ` presId="${layoutUrn}"`;
  const presOf =
    cxn('presOf', docId, pRoot, 0, presId) + texts.map((_, i) => cxn('presOf', nodeIds[i] as string, pText[i] as string, 0, presId)).join('');
  const presParOf =
    cxn('presParOf', pRoot, pAxis, 0, presId) +
    cxn('presParOf', pRoot, pPeriods, 1, presId) +
    texts
      .map(
        (_, i) =>
          cxn('presParOf', pPeriods, pPeriod[i] as string, i, presId) +
          cxn('presParOf', pPeriod[i] as string, pDot[i] as string, 0, presId) +
          cxn('presParOf', pPeriod[i] as string, pText[i] as string, 1, presId)
      )
      .join('');

  const withDrawing = options.drawing === true;
  const dataXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet loTypeId="${layoutUrn}" loCatId="process" ` +
    `qsTypeId="${STYLE_URN}" qsCatId="simple" csTypeId="${COLORS_URN}" csCatId="accent1"/><dgm:spPr/></dgm:pt>` +
    contentPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOf}${presOf}${presParOf}</dgm:cxnLst>` +
    `<dgm:bg/><dgm:whole/>${withDrawing ? DRAWING_EXT_LST_XML : ''}</dgm:dataModel>`;

  const g = geometry(texts);
  const out: SmartArtTimelineOutput = {
    dataXml,
    layoutXml: timelineLayoutXml(n),
    colorsXml: buildColorsXml(style, COLORS_URN, LABELS),
    styleXml: buildStyleXml(style, STYLE_URN, LABELS),
    frame: g.frame,
  };
  if (withDrawing) out.drawingXml = buildDiagramDrawingXml(timelineShapes(g, texts, { axis: pAxis, dot: pDot, text: pText }, style), style);
  return out;
}

/** The cached drawing: the same geometry as the `layoutDef`, in EMU. */
function timelineShapes(
  g: Geometry,
  texts: LabelToken[][],
  ids: { axis: string; dot: string[]; text: string[] },
  style: SmartArtStyle,
): DrawingShape[] {
  const { cx: W, cy: H } = g.frame;
  const font = fitFontSize(texts, g.boxW, g.boxH, 10);
  const shapes: DrawingShape[] = [
    {
      modelId: ids.axis,
      x: 0,
      y: Math.round((0.5 - AXIS_H / 2) * H),
      cx: W,
      cy: Math.round(AXIS_H * H),
      prst: 'rightArrow',
      accent: accentOf(style, 'sibTrans', 0),
      tintPercent: 60,
    },
  ];
  texts.forEach((text, i) => {
    const c = g.centres[i] as number;
    const accent = accentOf(style, 'node1', i);
    shapes.push({
      modelId: ids.dot[i] as string,
      x: Math.round(c - g.dot / 2),
      y: Math.round(H / 2 - g.dot / 2),
      cx: Math.round(g.dot),
      cy: Math.round(g.dot),
      prst: 'ellipse',
      accent,
    });
    shapes.push({
      modelId: ids.text[i] as string,
      x: Math.round(c - g.boxW / 2),
      y: i % 2 === 0 ? 0 : Math.round(H - g.boxH),
      cx: Math.round(g.boxW),
      cy: Math.round(g.boxH),
      prst: 'roundRect',
      text,
      fontSize: font,
      accent,
    });
  });
  return shapes;
}
