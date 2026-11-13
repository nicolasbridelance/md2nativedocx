/**
 * SmartArt for a Mermaid `kanban` board, in the spirit of Word's "Grouped List": one column per board column,
 * its title in a coloured header, its cards stacked under it as neutral cards (title in bold, then a line with
 * the ticket, the assignee and the priority). Two-level data model — columns, then their cards — so moving or
 * adding a card in Word is a Text Pane edit.
 *
 * Original `layoutDef` (`lin` of `composite`s; each column's cards in a top-to-bottom `lin` aligned to the top).
 * Card height depends on the board (tallest column, longest card), so each shape of board gets its own
 * `uniqueId` (`kanban1-4x2`: up to 4 cards of up to 2 lines).
 */

import type { LabelToken } from '../types.js';
import type { KanbanBoard, KanbanCard } from '../diagrams/kanban/types.js';
import { DRAWING_EXT_LST_XML, buildDiagramDrawingXml, fitFontSize, textFits, type DrawingShape } from './drawing.js';
import { accentOf, buildColorsXml, buildStyleXml, type SmartArtStyle, type StyleLabel } from './styles.js';
import { pointTextXml, textLines } from './text.js';
import type { SmartArtGenerateOptions } from './generate-options.js';
import type { SmartArtTimelineOutput } from './timeline.js';
import type { SmartArtGenerated } from './dispatch.js';

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

export const KANBAN_LAYOUT_URN_PREFIX = 'urn:md2nativedocx/smartart-layout/kanban1';
const COLORS_URN = 'urn:md2nativedocx/smartart-colors/kanban1';
const STYLE_URN = 'urn:md2nativedocx/smartart-quickstyle/kanban1';
const LABELS: StyleLabel[] = ['node1', 'card'];

const FRAME_CX = 5486400;
const EMU_PER_PT = 12700;
/** Header height and gaps, in points; a card is sized for its lines at about 12 pt. */
const HEADER_PT = 28;
const GAP_PT = 6;
const COLUMN_GAP = 0.03;
const CARD_FILL = 'F2F2F2';
const CARD_LINE = 'BFBFBF';

/** A card's text: its title in bold, then ticket · assignee · priority when it has any. */
export function kanbanCardText(card: KanbanCard): LabelToken[] {
  const tokens: LabelToken[] = [];
  card.title.split('\n').forEach((line, i) => {
    if (i > 0) tokens.push({ break: true });
    tokens.push({ text: line, bold: true });
  });
  const meta = [card.ticket, card.assigned, card.priority].filter((m): m is string => !!m);
  if (meta.length > 0) tokens.push({ break: true }, { text: meta.join(' · ') });
  return tokens;
}

interface Geometry {
  frame: { cx: number; cy: number };
  columnW: number;
  columnStep: number;
  headerH: number;
  cardH: number;
  gap: number;
  maxCards: number;
  maxLines: number;
}

function geometry(board: KanbanBoard): Geometry {
  const n = board.columns.length;
  const maxCards = Math.max(1, ...board.columns.map((c) => c.cards.length));
  const maxLines = Math.max(1, ...board.columns.flatMap((c) => c.cards.map((card) => textLines(kanbanCardText(card)).length)));
  const cardPt = maxLines * 12 * 1.25 + 10;
  const cyPt = HEADER_PT + GAP_PT + maxCards * (cardPt + GAP_PT);
  const columnStep = FRAME_CX / n;
  return {
    frame: { cx: FRAME_CX, cy: Math.round(cyPt * EMU_PER_PT) },
    columnW: columnStep * (1 - COLUMN_GAP),
    columnStep,
    headerH: HEADER_PT * EMU_PER_PT,
    cardH: cardPt * EMU_PER_PT,
    gap: GAP_PT * EMU_PER_PT,
    maxCards,
    maxLines,
  };
}

/** Whether `board` becomes SmartArt: at least one card, and every title and card keeps its words whole at 10 pt. */
export function kanbanFitsSmartArt(board: KanbanBoard): boolean {
  if (board.columns.length === 0 || board.columns.every((c) => c.cards.length === 0)) return false;
  const g = geometry(board);
  return board.columns.every(
    (c) =>
      textFits([[{ text: c.title }]], g.columnW, g.headerH, 10) &&
      (c.cards.length === 0 || textFits(c.cards.map(kanbanCardText), g.columnW, g.cardH, 10))
  );
}

/** The original `dgm:layoutDef` for a board of geometry `g`. */
function kanbanLayoutXml(g: Geometry): string {
  const H = g.frame.cy;
  const cardsTop = (g.headerH + g.gap) / H;
  const cardsArea = H - g.headerH - g.gap;
  const margins =
    '<dgm:constrLst>' +
    '<dgm:constr type="lMarg" refType="primFontSz" fact="0.15"/><dgm:constr type="rMarg" refType="primFontSz" fact="0.15"/>' +
    '<dgm:constr type="tMarg" refType="primFontSz" fact="0.1"/><dgm:constr type="bMarg" refType="primFontSz" fact="0.1"/>' +
    '</dgm:constrLst>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${kanbanLayoutUrn(g)}">` +
    '<dgm:title val=""/><dgm:desc val=""/>' +
    '<dgm:catLst><dgm:cat type="list" pri="1"/></dgm:catLst>' +
    '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
    '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
    '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
    '<dgm:layoutNode name="root">' +
    '<dgm:alg type="lin"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="14"/>' +
    '<dgm:constr type="w" for="ch" forName="column" refType="w"/>' +
    '<dgm:constr type="h" for="ch" forName="column" refType="h"/>' +
    `<dgm:constr op="equ" type="sp" refType="w" refFor="ch" refForName="column" fact="${(COLUMN_GAP / (1 - COLUMN_GAP)).toFixed(4)}"/>` +
    '</dgm:constrLst>' +
    '<dgm:forEach name="columnForEach" axis="ch" ptType="node">' +
    '<dgm:layoutNode name="column">' +
    '<dgm:alg type="composite"/><dgm:shape/>' +
    '<dgm:constrLst>' +
    '<dgm:constr type="l" for="ch" forName="header" val="0"/><dgm:constr type="t" for="ch" forName="header" val="0"/>' +
    '<dgm:constr type="w" for="ch" forName="header" refType="w"/>' +
    `<dgm:constr type="h" for="ch" forName="header" refType="h" fact="${(g.headerH / H).toFixed(4)}"/>` +
    '<dgm:constr type="l" for="ch" forName="cards" val="0"/>' +
    `<dgm:constr type="t" for="ch" forName="cards" refType="h" fact="${cardsTop.toFixed(4)}"/>` +
    '<dgm:constr type="w" for="ch" forName="cards" refType="w"/>' +
    `<dgm:constr type="h" for="ch" forName="cards" refType="h" fact="${(cardsArea / H).toFixed(4)}"/>` +
    '</dgm:constrLst>' +
    '<dgm:layoutNode name="header" styleLbl="node1">' +
    '<dgm:alg type="tx"/><dgm:shape type="roundRect"/>' +
    '<dgm:presOf axis="self" ptType="node"/>' +
    margins +
    '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
    '</dgm:layoutNode>' +
    '<dgm:layoutNode name="cards">' +
    '<dgm:alg type="lin"><dgm:param type="linDir" val="fromT"/><dgm:param type="nodeVertAlign" val="t"/></dgm:alg><dgm:shape/>' +
    '<dgm:constrLst>' +
    '<dgm:constr type="w" for="ch" forName="card" refType="w"/>' +
    `<dgm:constr type="h" for="ch" forName="card" refType="h" fact="${(g.cardH / cardsArea).toFixed(4)}"/>` +
    `<dgm:constr op="equ" type="sp" refType="h" fact="${(g.gap / cardsArea).toFixed(4)}"/>` +
    '</dgm:constrLst>' +
    '<dgm:forEach name="cardForEach" axis="ch" ptType="node">' +
    '<dgm:layoutNode name="card" styleLbl="card">' +
    '<dgm:alg type="tx"/><dgm:shape type="roundRect"/>' +
    '<dgm:presOf axis="self" ptType="node"/>' +
    margins +
    '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
    '</dgm:layoutNode>' +
    '</dgm:forEach>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutNode>' +
    '</dgm:forEach>' +
    '</dgm:layoutNode>' +
    '</dgm:layoutDef>'
  );
}

function kanbanLayoutUrn(g: Geometry): string {
  return `${KANBAN_LAYOUT_URN_PREFIX}-${g.maxCards}x${g.maxLines}`;
}

/** Generate the parts of a kanban SmartArt. The caller checks {@link kanbanFitsSmartArt} first. */
export function generateKanban(board: KanbanBoard, options: SmartArtGenerateOptions = {}): SmartArtTimelineOutput {
  const style: SmartArtStyle = options.style ?? 'simple';
  const g = geometry(board);
  const layoutUrn = kanbanLayoutUrn(g);
  const cardCount = board.columns.reduce((sum, c) => sum + c.cards.length, 0);

  // Model ids are plain unsigned integers (ST_ModelId, ECMA-376 §21.4) from one counter.
  let next = 0;
  const newId = (): string => String(next++);
  const docId = newId();
  const cols = board.columns.map((c) => ({
    title: c.title,
    id: newId(),
    parOf: newId(),
    parTrans: newId(),
    sibTrans: newId(),
    cards: c.cards.map((card) => ({ text: kanbanCardText(card), id: newId(), parOf: newId(), parTrans: newId(), sibTrans: newId(), pCard: '' })),
    pColumn: '',
    pHeader: '',
    pCards: '',
  }));
  const pRoot = newId();
  for (const c of cols) {
    c.pColumn = newId();
    c.pHeader = newId();
    c.pCards = newId();
    for (const card of c.cards) card.pCard = newId();
  }

  const transPts = (parOf: string, parTrans: string, sibTrans: string) =>
    `<dgm:pt modelId="${parTrans}" type="parTrans" cxnId="${parOf}"><dgm:prSet/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="${sibTrans}" type="sibTrans" cxnId="${parOf}"><dgm:prSet/><dgm:spPr/></dgm:pt>`;
  const contentPts = cols
    .map(
      (c) =>
        `<dgm:pt modelId="${c.id}"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/>${pointTextXml([{ text: c.title }])}</dgm:pt>` +
        transPts(c.parOf, c.parTrans, c.sibTrans) +
        c.cards
          .map((card) => `<dgm:pt modelId="${card.id}"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/>${pointTextXml(card.text)}</dgm:pt>` + transPts(card.parOf, card.parTrans, card.sibTrans))
          .join('')
    )
    .join('');
  const pres = (id: string, assoc: string, name: string, extra = '') =>
    `<dgm:pt modelId="${id}" type="pres"><dgm:prSet presAssocID="${assoc}" presName="${name}"${extra}/><dgm:spPr/></dgm:pt>`;
  let cardIdx = 0;
  const presPts =
    pres(pRoot, docId, 'root', ' presStyleCnt="0"') +
    cols
      .map(
        (c, i) =>
          pres(c.pColumn, c.id, 'column', ' presStyleCnt="0"') +
          pres(c.pHeader, c.id, 'header', ` presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${cols.length}"`) +
          pres(c.pCards, c.id, 'cards', ' presStyleCnt="0"') +
          c.cards.map((card) => pres(card.pCard, card.id, 'card', ` presStyleLbl="card" presStyleIdx="${cardIdx++}" presStyleCnt="${cardCount}"`)).join('')
      )
      .join('');

  const presId = ` presId="${layoutUrn}"`;
  const cxn = (type: string, src: string, dest: string, srcOrd: number) =>
    `<dgm:cxn modelId="${newId()}" type="${type}" srcId="${src}" destId="${dest}" srcOrd="${srcOrd}" destOrd="0"${presId}/>`;
  const parOf = (id: string, src: string, dest: string, ord: number, parTrans: string, sibTrans: string) =>
    `<dgm:cxn modelId="${id}" type="parOf" srcId="${src}" destId="${dest}" srcOrd="${ord}" destOrd="0" parTransId="${parTrans}" sibTransId="${sibTrans}"/>`;
  const parOfCxns = cols
    .map((c, i) => parOf(c.parOf, docId, c.id, i, c.parTrans, c.sibTrans) + c.cards.map((card, j) => parOf(card.parOf, c.id, card.id, j, card.parTrans, card.sibTrans)).join(''))
    .join('');
  const presOfCxns =
    cxn('presOf', docId, pRoot, 0) + cols.map((c) => cxn('presOf', c.id, c.pHeader, 0) + c.cards.map((card) => cxn('presOf', card.id, card.pCard, 0)).join('')).join('');
  const presParOfCxns = cols
    .map(
      (c, i) =>
        cxn('presParOf', pRoot, c.pColumn, i) +
        cxn('presParOf', c.pColumn, c.pHeader, 0) +
        cxn('presParOf', c.pColumn, c.pCards, 1) +
        c.cards.map((card, j) => cxn('presParOf', c.pCards, card.pCard, j)).join('')
    )
    .join('');

  const withDrawing = options.drawing === true;
  const dataXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet loTypeId="${layoutUrn}" loCatId="list" ` +
    `qsTypeId="${STYLE_URN}" qsCatId="simple" csTypeId="${COLORS_URN}" csCatId="accent1"/><dgm:spPr/></dgm:pt>` +
    contentPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns}${presOfCxns}${presParOfCxns}</dgm:cxnLst>` +
    `<dgm:bg/><dgm:whole/>${withDrawing ? DRAWING_EXT_LST_XML : ''}</dgm:dataModel>`;

  const out: SmartArtTimelineOutput = {
    dataXml,
    layoutXml: kanbanLayoutXml(g),
    colorsXml: buildColorsXml(style, COLORS_URN, LABELS),
    styleXml: buildStyleXml(style, STYLE_URN, LABELS),
    frame: g.frame,
  };
  if (!withDrawing) return out;

  // One font for every box, as the layout's `primFontSz` equality makes Word do.
  const allCards = cols.flatMap((c) => c.cards.map((card) => card.text));
  const font = Math.min(
    fitFontSize(cols.map((c) => [{ text: c.title }]), g.columnW, g.headerH, 10),
    allCards.length > 0 ? fitFontSize(allCards, g.columnW, g.cardH, 10) : 2400,
    1400
  );
  const shapes: DrawingShape[] = [];
  cols.forEach((c, i) => {
    const x = Math.round(i * g.columnStep + (g.columnStep - g.columnW) / 2);
    shapes.push({
      modelId: c.pHeader,
      x,
      y: 0,
      cx: Math.round(g.columnW),
      cy: Math.round(g.headerH),
      prst: 'roundRect',
      text: [{ text: c.title }],
      fontSize: font,
      accent: accentOf(style, 'node1', i),
    });
    c.cards.forEach((card, j) => {
      shapes.push({
        modelId: card.pCard,
        x,
        y: Math.round(g.headerH + g.gap + j * (g.cardH + g.gap)),
        cx: Math.round(g.columnW),
        cy: Math.round(g.cardH),
        prst: 'roundRect',
        text: card.text,
        fontSize: font,
        fill: CARD_FILL,
        line: CARD_LINE,
      });
    });
  });
  out.drawingXml = buildDiagramDrawingXml(shapes, style);
  return out;
}

/** SmartArt parts for a parsed `kanban`, or `null` when it cannot be one ({@link kanbanFitsSmartArt}). */
export function generateKanbanSmartArt(board: KanbanBoard, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  return kanbanFitsSmartArt(board) ? { layout: 'list', ...generateKanban(board, options) } : null;
}
