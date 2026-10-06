/**
 * SmartArt time line with groups: the shape of a Mermaid `timeline` with sections and of a `journey` (whose
 * tasks are always grouped in sections). The axis is a row of arrow-ended bars (`homePlate`), one per section,
 * with the section's name inside; each step of a section is a neutral card standing above or below its section's
 * bar, alternately. Sections share the width equally, and each section's steps share its width.
 *
 * Data model: two levels, as Word's Text Pane shows them — each section a top-level point, its steps indented
 * under it. Adding a step or a whole section in Word is one line in the Text Pane. Original `layoutDef`
 * (`lin` of `composite`s, sides switched with `func="posOdd"` as in `timeline.ts`, whose alternation was
 * confirmed in real Word). Each section is as wide as its steps, so every step gets the same width; that takes
 * one definition per section structure (`timeline1-grouped-3-2`, see {@link groupedTimelineLayoutXml}). Step positions restart at each section, so two neighbouring cards across a section boundary
 * may land on the same side; they still never overlap.
 */

import type { LabelToken } from '../types.js';
import { DRAWING_EXT_LST_XML, buildDiagramDrawingXml, fitFontSize, textFits, type DrawingShape } from './drawing.js';
import { accentOf, buildColorsXml, buildStyleXml, type SmartArtStyle, type StyleLabel } from './styles.js';
import { pointTextXml, textLines } from './text.js';
import { BOX_H, FRAME_CX, frameHeight, type SmartArtTimelineOutput } from './timeline.js';
import type { SmartArtGenerateOptions } from './generate-options.js';

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

export const GROUPED_TIMELINE_LAYOUT_URN = 'urn:md2nativedocx/smartart-layout/timeline1-grouped';
const COLORS_URN = 'urn:md2nativedocx/smartart-colors/timeline1-grouped';
const STYLE_URN = 'urn:md2nativedocx/smartart-quickstyle/timeline1-grouped';
const LABELS: StyleLabel[] = ['node1', 'card'];

/** Bar height (fraction of the diagram height), centred; cards take {@link BOX_H} above or below it. */
const BAR_H = 0.16;
/** A card's width as a fraction of its slot (a small gap between cards). */
const CARD_W = 0.94;
/** Drawing colours of a card (match `CARD_COLORS_DEF` on the default Office theme). */
const CARD_FILL = 'F2F2F2';
const CARD_LINE = 'BFBFBF';

/** One section and its steps, in order. */
export interface TimeLineGroup {
  label: string;
  steps: LabelToken[][];
}

/** Each section's share of the width: its number of steps (at least one), so every step gets the same width. */
export function sectionWeights(counts: number[]): number[] {
  const slots = counts.map((n) => Math.max(1, n));
  const total = slots.reduce((a, b) => a + b, 0);
  return slots.map((n) => n / total);
}

/**
 * The original `dgm:layoutDef` for sections of `counts` steps. Each section gets its own `forEach` (one point,
 * `st`/`cnt`) and layout-node names suffixed with its index, so that its width can follow its step count; a final
 * catch-all (`…X`) lays out any section added later in Word, at an average width. One `uniqueId` per structure
 * (`timeline1-grouped-3-2`); adding steps in Word keeps the section widths.
 */
export function groupedTimelineLayoutXml(counts: number[]): string {
  const weights = sectionWeights(counts);
  const margins =
    '<dgm:constrLst>' +
    '<dgm:constr type="lMarg" refType="primFontSz" fact="0.15"/><dgm:constr type="rMarg" refType="primFontSz" fact="0.15"/>' +
    '<dgm:constr type="tMarg" refType="primFontSz" fact="0.1"/><dgm:constr type="bMarg" refType="primFontSz" fact="0.1"/>' +
    '</dgm:constrLst>';
  const cardConstr = (k: string, top: boolean) =>
    '<dgm:constrLst>' +
    `<dgm:constr type="w" for="ch" forName="card${k}" refType="w" fact="${CARD_W}"/>` +
    `<dgm:constr type="h" for="ch" forName="card${k}" refType="h" fact="${BOX_H}"/>` +
    `<dgm:constr type="ctrX" for="ch" forName="card${k}" refType="w" fact="0.5"/>` +
    (top
      ? `<dgm:constr type="t" for="ch" forName="card${k}" val="0"/>`
      : `<dgm:constr type="t" for="ch" forName="card${k}" refType="h" fact="${(1 - BOX_H).toFixed(2)}"/>`) +
    '</dgm:constrLst>';
  const section = (k: string, st: number, cnt: number) =>
    `<dgm:forEach name="sectionForEach${k}" axis="ch" ptType="node" st="${st}"${cnt > 0 ? ` cnt="${cnt}"` : ''}>` +
    `<dgm:layoutNode name="section${k}">` +
    '<dgm:alg type="composite"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    `<dgm:constr type="l" for="ch" forName="bar${k}" val="0"/>` +
    `<dgm:constr type="w" for="ch" forName="bar${k}" refType="w"/>` +
    `<dgm:constr type="h" for="ch" forName="bar${k}" refType="h" fact="${BAR_H}"/>` +
    `<dgm:constr type="ctrY" for="ch" forName="bar${k}" refType="h" fact="0.5"/>` +
    `<dgm:constr type="l" for="ch" forName="steps${k}" val="0"/>` +
    `<dgm:constr type="t" for="ch" forName="steps${k}" val="0"/>` +
    `<dgm:constr type="w" for="ch" forName="steps${k}" refType="w"/>` +
    `<dgm:constr type="h" for="ch" forName="steps${k}" refType="h"/>` +
    '</dgm:constrLst>' +
    // The section's own bar: its name, on an arrow-ended bar.
    `<dgm:layoutNode name="bar${k}" styleLbl="node1">` +
    '<dgm:alg type="tx"/><dgm:shape type="homePlate"/>' +
    '<dgm:presOf axis="self" ptType="node"/>' +
    margins +
    '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
    '</dgm:layoutNode>' +
    `<dgm:layoutNode name="steps${k}">` +
    '<dgm:alg type="lin"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    `<dgm:constr type="w" for="ch" forName="step${k}" refType="w"/>` +
    `<dgm:constr type="h" for="ch" forName="step${k}" refType="h"/>` +
    '<dgm:constr op="equ" type="sp" val="0"/>' +
    '</dgm:constrLst>' +
    `<dgm:forEach name="stepForEach${k}" axis="ch" ptType="node">` +
    `<dgm:layoutNode name="step${k}">` +
    '<dgm:alg type="composite"/><dgm:shape/>' +
    `<dgm:choose name="side${k}">` +
    `<dgm:if name="above${k}" axis="self" func="posOdd" op="equ" val="1">${cardConstr(k, true)}</dgm:if>` +
    `<dgm:else name="below${k}">${cardConstr(k, false)}</dgm:else>` +
    '</dgm:choose>' +
    `<dgm:layoutNode name="card${k}" styleLbl="card">` +
    '<dgm:alg type="tx"/><dgm:shape type="roundRect"/>' +
    '<dgm:presOf axis="self" ptType="node"/>' +
    margins +
    '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutNode>' +
    '</dgm:forEach>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutNode>' +
    '</dgm:forEach>';
  const widths =
    weights
      .map(
        (w, i) =>
          `<dgm:constr type="w" for="ch" forName="section${i}" refType="w" fact="${w.toFixed(4)}"/>` +
          `<dgm:constr type="h" for="ch" forName="section${i}" refType="h"/>`
      )
      .join('') +
    `<dgm:constr type="w" for="ch" forName="sectionX" refType="w" fact="${(1 / weights.length).toFixed(4)}"/>` +
    '<dgm:constr type="h" for="ch" forName="sectionX" refType="h"/>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${groupedTimelineLayoutUrn(counts)}">` +
    '<dgm:title val=""/><dgm:desc val=""/>' +
    '<dgm:catLst><dgm:cat type="process" pri="1"/></dgm:catLst>' +
    '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
    '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
    '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
    '<dgm:layoutNode name="root">' +
    '<dgm:alg type="lin"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="16"/>' +
    widths +
    '<dgm:constr op="equ" type="sp" val="0"/>' +
    '</dgm:constrLst>' +
    counts.map((_, i) => section(String(i), i + 1, 1)).join('') +
    section('X', counts.length + 1, 0) +
    '</dgm:layoutNode>' +
    '</dgm:layoutDef>'
  );
}

/** Layout id for sections of `counts` steps. */
export function groupedTimelineLayoutUrn(counts: number[]): string {
  return `${GROUPED_TIMELINE_LAYOUT_URN}-${counts.join('-')}`;
}

interface Geometry {
  frame: { cx: number; cy: number };
  /** Per section: its width and left edge. */
  sectionW: number[];
  sectionX: number[];
  /** Per section: its steps' slot width. */
  slotW: number[];
  boxH: number;
  barH: number;
}

function geometry(groups: TimeLineGroup[]): Geometry {
  const lines = Math.max(1, ...groups.flatMap((g) => g.steps.map((s) => textLines(s).length)));
  const cy = frameHeight(lines);
  const sectionW = sectionWeights(groups.map((g) => g.steps.length)).map((w) => w * FRAME_CX);
  const sectionX = sectionW.map((_, i) => sectionW.slice(0, i).reduce((a, b) => a + b, 0));
  return {
    frame: { cx: FRAME_CX, cy },
    sectionW,
    sectionX,
    slotW: groups.map((g, i) => (sectionW[i] as number) / Math.max(1, g.steps.length)),
    boxH: BOX_H * cy,
    barH: BAR_H * cy,
  };
}

/**
 * Whether every card and section name keeps its words whole at 10 pt or more; when not (too many steps in a
 * section, long words), a caller keeps the shape-built rendering. Needs at least one section with a step.
 */
export function groupedTimelineTextFits(groups: TimeLineGroup[]): boolean {
  if (groups.length === 0 || groups.every((g) => g.steps.length === 0)) return false;
  const g = geometry(groups);
  return groups.every(
    (group, i) =>
      textFits([[{ text: group.label }]], g.sectionW[i] as number, g.barH, 10) &&
      (group.steps.length === 0 || textFits(group.steps, CARD_W * (g.slotW[i] as number), g.boxH, 10))
  );
}

/** Generate the parts of a grouped time line. The caller checks {@link groupedTimelineTextFits} first. */
export function generateGroupedTimeline(groups: TimeLineGroup[], options: SmartArtGenerateOptions = {}): SmartArtTimelineOutput {
  const style: SmartArtStyle = options.style ?? 'simple';
  const counts = groups.map((gr) => gr.steps.length);
  const layoutUrn = groupedTimelineLayoutUrn(counts);
  const stepCount = groups.reduce((sum, g) => sum + g.steps.length, 0);

  // Model ids are plain unsigned integers (ST_ModelId, ECMA-376 §21.4) from one counter.
  let next = 0;
  const newId = (): string => String(next++);
  const docId = newId();
  const sec = groups.map((g) => ({
    id: newId(),
    parOf: newId(),
    parTrans: newId(),
    sibTrans: newId(),
    pSection: '',
    pBar: '',
    pSteps: '',
    steps: g.steps.map((text) => ({ text, id: newId(), parOf: newId(), parTrans: newId(), sibTrans: newId(), pStep: '', pCard: '' })),
  }));
  const pRoot = newId();
  for (const s of sec) {
    s.pSection = newId();
    s.pBar = newId();
    s.pSteps = newId();
    for (const st of s.steps) {
      st.pStep = newId();
      st.pCard = newId();
    }
  }

  const transPts = (parOf: string, parTrans: string, sibTrans: string) =>
    `<dgm:pt modelId="${parTrans}" type="parTrans" cxnId="${parOf}"><dgm:prSet/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="${sibTrans}" type="sibTrans" cxnId="${parOf}"><dgm:prSet/><dgm:spPr/></dgm:pt>`;
  const contentPts = sec
    .map(
      (s, i) =>
        `<dgm:pt modelId="${s.id}"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/>${pointTextXml([{ text: (groups[i] as TimeLineGroup).label }])}</dgm:pt>` +
        transPts(s.parOf, s.parTrans, s.sibTrans) +
        s.steps
          .map((st) => `<dgm:pt modelId="${st.id}"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/>${pointTextXml(st.text)}</dgm:pt>` + transPts(st.parOf, st.parTrans, st.sibTrans))
          .join('')
    )
    .join('');

  const pres = (id: string, assoc: string, name: string, extra = '') =>
    `<dgm:pt modelId="${id}" type="pres"><dgm:prSet presAssocID="${assoc}" presName="${name}"${extra}/><dgm:spPr/></dgm:pt>`;
  let cardIdx = 0;
  const presPts =
    pres(pRoot, docId, 'root', ' presStyleCnt="0"') +
    sec
      .map(
        (s, i) =>
          pres(s.pSection, s.id, `section${i}`, ' presStyleCnt="0"') +
          pres(s.pBar, s.id, `bar${i}`, ` presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${sec.length}"`) +
          pres(s.pSteps, s.id, `steps${i}`, ' presStyleCnt="0"') +
          s.steps
            .map(
              (st) =>
                pres(st.pStep, st.id, `step${i}`, ' presStyleCnt="0"') +
                pres(st.pCard, st.id, `card${i}`, ` presStyleLbl="card" presStyleIdx="${cardIdx++}" presStyleCnt="${stepCount}"`)
            )
            .join('')
      )
      .join('');

  const presId = ` presId="${layoutUrn}"`;
  const cxn = (type: string, src: string, dest: string, srcOrd: number, extra = '') =>
    `<dgm:cxn modelId="${newId()}" type="${type}" srcId="${src}" destId="${dest}" srcOrd="${srcOrd}" destOrd="0"${extra}/>`;
  const parOf = (id: string, src: string, dest: string, ord: number, parTrans: string, sibTrans: string) =>
    `<dgm:cxn modelId="${id}" type="parOf" srcId="${src}" destId="${dest}" srcOrd="${ord}" destOrd="0" parTransId="${parTrans}" sibTransId="${sibTrans}"/>`;
  const parOfCxns = sec
    .map(
      (s, i) =>
        parOf(s.parOf, docId, s.id, i, s.parTrans, s.sibTrans) +
        s.steps.map((st, j) => parOf(st.parOf, s.id, st.id, j, st.parTrans, st.sibTrans)).join('')
    )
    .join('');
  const presOfCxns =
    cxn('presOf', docId, pRoot, 0, presId) +
    sec.map((s) => cxn('presOf', s.id, s.pBar, 0, presId) + s.steps.map((st) => cxn('presOf', st.id, st.pCard, 0, presId)).join('')).join('');
  const presParOfCxns = sec
    .map(
      (s, i) =>
        cxn('presParOf', pRoot, s.pSection, i, presId) +
        cxn('presParOf', s.pSection, s.pBar, 0, presId) +
        cxn('presParOf', s.pSection, s.pSteps, 1, presId) +
        s.steps.map((st, j) => cxn('presParOf', s.pSteps, st.pStep, j, presId) + cxn('presParOf', st.pStep, st.pCard, 0, presId)).join('')
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
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns}${presOfCxns}${presParOfCxns}</dgm:cxnLst>` +
    `<dgm:bg/><dgm:whole/>${withDrawing ? DRAWING_EXT_LST_XML : ''}</dgm:dataModel>`;

  const g = geometry(groups);
  const out: SmartArtTimelineOutput = {
    dataXml,
    layoutXml: groupedTimelineLayoutXml(counts),
    colorsXml: buildColorsXml(style, COLORS_URN, LABELS),
    styleXml: buildStyleXml(style, STYLE_URN, LABELS),
    frame: g.frame,
  };
  if (!withDrawing) return out;

  const H = g.frame.cy;
  const barFont = Math.min(...groups.map((gr, i) => fitFontSize([[{ text: gr.label }]], g.sectionW[i] as number, g.barH, 10)));
  // One font for every box, as the layout's `primFontSz` equality makes Word do.
  const font = Math.min(
    barFont,
    ...groups.map((gr, i) => (gr.steps.length > 0 ? fitFontSize(gr.steps, CARD_W * (g.slotW[i] as number), g.boxH, 10) : 2400))
  );
  const shapes: DrawingShape[] = [];
  sec.forEach((s, i) => {
    const x0 = g.sectionX[i] as number;
    shapes.push({
      modelId: s.pBar,
      x: Math.round(x0),
      y: Math.round((H - g.barH) / 2),
      cx: Math.round(g.sectionW[i] as number),
      cy: Math.round(g.barH),
      prst: 'homePlate',
      text: [{ text: (groups[i] as TimeLineGroup).label }],
      fontSize: font,
      accent: accentOf(style, 'node1', i),
    });
    const slot = g.slotW[i] as number;
    s.steps.forEach((st, j) => {
      const w = CARD_W * slot;
      shapes.push({
        modelId: st.pCard,
        x: Math.round(x0 + slot * (j + 0.5) - w / 2),
        y: j % 2 === 0 ? 0 : Math.round(H - g.boxH),
        cx: Math.round(w),
        cy: Math.round(g.boxH),
        prst: 'roundRect',
        text: st.text,
        fontSize: font,
        fill: CARD_FILL,
        line: CARD_LINE,
      });
    });
  });
  out.drawingXml = buildDiagramDrawingXml(shapes, style);
  return out;
}
