/**
 * SmartArt generator for the `cycle` topology (`docs/specs/FUTURE_mmd2smartart_SPEC.md`
 * §7 step 4; classification comes from {@link classifyTopology} in
 * `./classify.ts`, not repeated here).
 *
 * Same four-part self-authored recipe as `chain.ts`/`tree.ts` (data/layout/
 * colors/style, none copied from or derived from a real Word-emitted file —
 * ADR 0004 "Round 5"), built around the public ECMA-376 `dgm:alg
 * type="cycle"` algorithm (the one Word's own built-in "Basic Cycle" layout
 * also uses, per `docs/smartart-layout-catalog.md` — but this `layoutDef` is
 * original, not extracted from Word). `cycle` arranges its `forEach`-matched
 * children evenly around a circle on its own; unlike `chain.ts`'s `lin`, it
 * needs no manual spacer nodes between items.
 *
 * Verified this session by rendering the actual output under headless
 * LibreOffice (session that built `docs/markdown-mermaid-compliance-table.md`):
 * a 4-node cycle rendered as 4 correctly-styled boxes at top/right/bottom/
 * left, in the right order, first try — no geometry bug like `tree.ts` hit.
 * Same known limitation as `chain`/`tree`: no connector line is drawn
 * between the boxes, only their circular position conveys the relationship.
 */

import type { Flowchart, FlowNode } from '../types.js';
import { validateHexColor } from '../translator/xml-escape.js';
import { buildColorsXml, buildStyleXml, type SmartArtStyle } from './styles.js';
import { CYCLE_FRAME, DRAWING_EXT_LST_XML, buildDiagramDrawingXml, cycleBoxWidth, cycleShapes } from './drawing.js';
import type { SmartArtGenerateOptions } from './generate-options.js';
import { nodeGeom, presSpPrXml } from './node-shape.js';
import { boxText, pointTextXml } from './text.js';

/** The four OOXML diagram parts a `cycle` SmartArt diagram needs. */
export interface SmartArtCycleOutput {
  /** `word/diagrams/data{N}.xml` — `dgm:dataModel`, generated per diagram. */
  dataXml: string;
  /** `word/diagrams/layout{N}.xml` — `dgm:layoutDef`, constant across diagrams. */
  layoutXml: string;
  /** `word/diagrams/colors{N}.xml` — `dgm:colorsDef`, constant across diagrams. */
  colorsXml: string;
  /** `word/diagrams/quickStyle{N}.xml` — `dgm:styleDef`, constant across diagrams. */
  styleXml: string;
  /** `word/diagrams/drawing{N}.xml` — pre-rendered `dsp:drawing`, only when `options.drawing` was set. */
  drawingXml?: string;
  /** Frame size (EMU) the diagram must be embedded in (the geometry assumes it). */
  frame?: { cx: number; cy: number };
}

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** `layoutDef` URN for the cycle algorithm (direction-independent — see module doc comment on `generateCycle`). */
export const CYCLE_LAYOUT_URN = 'urn:md2nativedocx/smartart-layout/cycle1';

/** `layoutDef` URN for a cycle of `n` nodes: the box size depends on `n`, so each count has its own definition. */
export function cycleLayoutUrn(n: number): string {
  return `${CYCLE_LAYOUT_URN}-n${n}`;
}

/**
 * Original `dgm:layoutDef`: a `cycle` algorithm root and, per node, one leaf `Main` layoutNode via
 * `forEach axis="ch"` — the same two-level shape as `chain.ts`'s `CHAIN_LAYOUT_XML`, which real Word
 * renders correctly. The root sizes every `Main` child (`w` = 30% of the diagram's width, so the
 * children fit around the circle); `Main` derives its own height from its width, exactly as `chain`'s
 * `Main` does.
 *
 * This replaces an earlier three-level version (`root` → `composite` → `Main`) that real Word drew as an
 * empty frame (2026-09-06 round 2: container and data pane present, no shape) while LibreOffice drew four
 * boxes. The cause is **suspected, not proven**: that version sized its children with a `diam` constraint
 * and gave the `composite` wrapper no `w`/`h` of its own, whereas `chain.ts` sizes `Main` with plain
 * `w`/`h` constraints from the root. (`tree.ts` also has a constraint-free `composite` and renders in Word,
 * so the wrapper alone is not the explanation.) Real-Word confirmation: CHECKLIST Round 6. With the
 * pre-rendered `dsp:drawing` (`drawing.ts`) Word shows the cached shapes either way until the diagram is
 * edited. No `sibTrans` spacer nodes — `cycle` positions its children
 * itself, it doesn't need `lin`'s manual inter-item spacer.
 */
export function cycleLayoutXml(n: number): string {
  const widthFact = (cycleBoxWidth(n) / CYCLE_FRAME.cx).toFixed(4);
  return (
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${cycleLayoutUrn(n)}">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="cycle" pri="1"/></dgm:catLst>' +
  '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
  '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
  '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
  '<dgm:layoutNode name="root">' +
  '<dgm:alg type="cycle"><dgm:param type="stAng" val="0"/></dgm:alg><dgm:shape/>' +
  '<dgm:constrLst>' +
  '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="20"/>' +
  `<dgm:constr type="w" for="ch" forName="Main" refType="w" fact="${widthFact}"/>` +
  '<dgm:constr op="equ" type="h" for="ch" forName="Main"/>' +
  '<dgm:constr op="equ" type="w" for="ch" forName="sibTrans" refType="w" refFor="ch" refForName="Main" fact="0.4"/>' +
  '<dgm:constr op="equ" type="h" for="ch" forName="sibTrans"/>' +
  '</dgm:constrLst>' +
  '<dgm:forEach name="nodesForEach" axis="ch" ptType="node">' +
  '<dgm:layoutNode name="Main" styleLbl="node1">' +
  '<dgm:alg type="tx"/>' +
  '<dgm:shape type="roundRect"/>' +
  '<dgm:presOf axis="self" ptType="node" st="1" cnt="0"/>' +
  '<dgm:constrLst>' +
  '<dgm:constr type="h" refType="w" fact="0.6"/>' +
  '<dgm:constr type="lMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="rMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="tMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="bMarg" refType="primFontSz" fact="0.15"/>' +
  '</dgm:constrLst>' +
  '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
  '</dgm:layoutNode>' +
  // One transition arrow after every node, the last one closing the loop back to the first. Same
  // `conn` node as chain.ts (nested in the node forEach, a sibling of `Main`). `hideLastTrans` defaults
  // to true in the schema, which hides the arrow after the last node — right for a process, wrong for a
  // loop: Word's own cycle layout sets it to 0, and without it the closing arrow is never drawn (found
  // in real Word: every cycle lacked the last-to-first arrow, with and without the cached drawing).
  '<dgm:forEach name="sibTransForEach" axis="followSib" ptType="sibTrans" hideLastTrans="0" cnt="1">' +
  '<dgm:layoutNode name="sibTrans" styleLbl="sibTrans">' +
  '<dgm:alg type="conn">' +
  '<dgm:param type="begPts" val="auto"/>' +
  '<dgm:param type="endPts" val="auto"/>' +
  '</dgm:alg>' +
  '<dgm:shape xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="conn" r:blip=""/>' +
  '<dgm:presOf axis="self"/>' +
  '<dgm:constrLst>' +
  '<dgm:constr type="h" refType="w" fact="0.62"/>' +
  '<dgm:constr type="connDist"/>' +
  '<dgm:constr type="begPad" refType="connDist" fact="0.25"/>' +
  '<dgm:constr type="endPad" refType="connDist" fact="0.22"/>' +
  '</dgm:constrLst>' +
  '</dgm:layoutNode>' +
  '</dgm:forEach>' +
  '</dgm:forEach>' +
  '</dgm:layoutNode>' +
  '</dgm:layoutDef>'
  );
}

/** The layout for the most common case (4 nodes); `generateCycle` writes the one matching the node count. */
export const CYCLE_LAYOUT_XML = cycleLayoutXml(4);

/**
 * Original `dgm:colorsDef` — single `styleLbl` (`node1`, the only style used
 * by {@link CYCLE_LAYOUT_XML}'s `Main` layoutNode), theme-linked
 * `a:schemeClr` fills (spec §10.4 theme-matching). Same pattern as
 * `chain.ts`'s `CHAIN_COLORS_XML`.
 */
export const CYCLE_COLORS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:colorsDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:md2nativedocx/smartart-colors/cycle1" minVer="12.0">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="mainScheme" pri="1"/></dgm:catLst>' +
  '<dgm:styleLbl name="node1">' +
  '<dgm:fillClrLst><a:schemeClr val="accent1"/></dgm:fillClrLst>' +
  '<dgm:linClrLst><a:schemeClr val="accent1"><a:shade val="75000"/></a:schemeClr></dgm:linClrLst>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
  '<dgm:txFillClrLst><a:schemeClr val="bg1"/></dgm:txFillClrLst>' +
  '<dgm:txEffectClrLst/>' +
  '</dgm:styleLbl>' +
  '<dgm:styleLbl name="sibTrans">' +
  '<dgm:fillClrLst><a:schemeClr val="accent1"><a:shade val="75000"/></a:schemeClr></dgm:fillClrLst>' +
  '<dgm:linClrLst/>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/><dgm:txFillClrLst/><dgm:txEffectClrLst/>' +
  '</dgm:styleLbl>' +
  '</dgm:colorsDef>';

/**
 * Original `dgm:styleDef` — single `styleLbl`, same reference-based style
 * vocabulary as `chain.ts`'s `CHAIN_STYLE_XML`.
 */
export const CYCLE_STYLE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:styleDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:md2nativedocx/smartart-quickstyle/cycle1" minVer="12.0">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="simple" pri="1"/></dgm:catLst>' +
  '<dgm:styleLbl name="node1">' +
  '<dgm:style>' +
  '<a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef>' +
  '<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>' +
  '<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>' +
  '</dgm:style>' +
  '</dgm:styleLbl>' +
  '<dgm:styleLbl name="sibTrans">' +
  '<dgm:style>' +
  '<a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef>' +
  '<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>' +
  '<a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>' +
  '</dgm:style>' +
  '</dgm:styleLbl>' +
  '</dgm:styleDef>';

/**
 * Order a `cycle`-classified flowchart's nodes around the loop, starting
 * arbitrarily at `flowchart.nodes[0]` and following `from -> to` edges.
 * Assumes the flowchart has already been confirmed `cycle`-eligible by
 * {@link classifyTopology} (`./classify.ts`) — every node in-degree ==
 * out-degree == 1, connected, no root — so following `next` edges from any
 * starting node visits every node exactly once and returns to the start.
 * This function does not re-validate that; a non-cycle flowchart could loop
 * forever or drop nodes silently.
 */
function orderedCycleNodes(flowchart: Flowchart): FlowNode[] {
  const byId = new Map(flowchart.nodes.map((n) => [n.id, n]));
  const nextId = new Map(flowchart.edges.map((e) => [e.from, e.to]));
  const startNode = flowchart.nodes[0];
  if (!startNode) {
    throw new Error('orderedCycleNodes: flowchart has no nodes -- not a valid cycle');
  }

  const ordered: FlowNode[] = [];
  let currentId: string | undefined = startNode.id;
  while (currentId !== undefined) {
    const node = byId.get(currentId);
    if (!node) break;
    ordered.push(node);
    const next: string | undefined = nextId.get(currentId);
    currentId = next === startNode.id ? undefined : next;
  }
  return ordered;
}

/** Map each node id to the label of the (single) edge that leads into it. */
function incomingLabelByNodeId(flowchart: Flowchart): Map<string, string> {
  const labels = new Map<string, string>();
  for (const edge of flowchart.edges) {
    if (edge.label) labels.set(edge.to, edge.label);
  }
  return labels;
}

/**
 * Build the `dgm:dataModel` for a cycle of `nodes`, including the hand-built
 * `presOf`/`presParOf` presentation mirror {@link CYCLE_LAYOUT_XML}'s own
 * `root`/`Main` layoutNodes need to render under LibreOffice
 * (same requirement as `chain.ts`/`tree.ts`, ADR 0004 "Round 5") — including
 * the `doc`-point-to-`p-root` `presOf` that both those modules needed to fix
 * an otherwise fully blank render.
 *
 * Also applies `edge.label` and `node.fill` the same way `chain.ts` does
 * (spec §5.2 convention; content-point `spPr` solidFill) — see that
 * module's doc comment for the full rationale and verification history.
 */
function buildCycleDataXml(
  flowchart: Flowchart,
  nodes: FlowNode[],
  withDrawing: boolean,
  style: SmartArtStyle,
): { xml: string; drawingXml?: string } {
  const docId = '0';
  const layoutUrn = cycleLayoutUrn(nodes.length);
  const nodeIds = nodes.map((_, i) => String(i + 1));
  const incomingLabel = incomingLabelByNodeId(flowchart);

  // ST_ModelId (ECMA-376 §21.4) only accepts an unsigned integer or a GUID
  // -- never an arbitrary string. Content point ids above were already
  // numeric ("0", "1", "2"...) and passed; every presentation point and
  // connection id below used to be a custom string ("p-root", "c1", "po0",
  // "pp1a"...), which is schema-invalid. Found with the Open XML SDK's
  // OpenXmlValidator (the same validator/schema real Word enforces
  // strictly, which is why this was never caught by LibreOffice or by
  // manual XML-well-formedness checks) -- this, not the presence/absence of
  // any dsp:drawing fallback, was the actual cause of TODO.md's "Incident
  // SmartArt 'cycle' cassé en Word réel". ADR 0004 "Round 3"'s finding that
  // "modelId format has no effect on rendering" was only ever verified
  // under LibreOffice, which does not validate against the schema at all.
  let nextModelId = nodes.length + 1;
  const newModelId = () => String(nextModelId++);
  const pRootId = newModelId();
  const pMainIds = new Map(nodeIds.map((id) => [id, newModelId()]));
  // One transition per node — the last one closes the loop back to the first.
  const sibTransIds = nodeIds.map(() => newModelId());
  const parTransIds = nodeIds.map(() => newModelId());
  const pSibTransIds = nodeIds.map(() => newModelId());

  const contentPts = nodes
    .map((node, i) => {
      const label = incomingLabel.get(node.id);
      const text = boxText(node, label);
      const fill = validateHexColor(node.fill, '');
      const spPr = fill
        ? `<dgm:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></dgm:spPr>`
        : '<dgm:spPr/>';
      return (
        `<dgm:pt modelId="${nodeIds[i]}"><dgm:prSet phldrT="[Texte]"/>${spPr}${pointTextXml(text)}</dgm:pt>` +
        `<dgm:pt modelId="${parTransIds[i]}" type="parTrans"><dgm:prSet/></dgm:pt>` +
        `<dgm:pt modelId="${sibTransIds[i]}" type="sibTrans"><dgm:prSet/></dgm:pt>`
      );
    })
    .join('');

  const presPts =
    `<dgm:pt modelId="${pRootId}" type="pres"><dgm:prSet presAssocID="${docId}" presName="root" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    nodeIds
      .map(
        (id, i) =>
          `<dgm:pt modelId="${pMainIds.get(id)}" type="pres"><dgm:prSet presAssocID="${id}" presName="Main" presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${nodeIds.length}"/>${presSpPrXml(nodeGeom(nodes[i] as FlowNode))}</dgm:pt>`
      )
      .join('') +
    sibTransIds
      .map(
        (id, i) =>
          `<dgm:pt modelId="${pSibTransIds[i]}" type="pres"><dgm:prSet presAssocID="${id}" presName="sibTrans" presStyleLbl="sibTrans" presStyleIdx="${i}" presStyleCnt="${sibTransIds.length}"/><dgm:spPr/></dgm:pt>`
      )
      .join('');

  const parOfCxns = nodeIds
    .map(
      (id, i) =>
        `<dgm:cxn modelId="${newModelId()}" type="parOf" srcId="${docId}" destId="${id}" srcOrd="${i}" destOrd="0" parTransId="${parTransIds[i]}" sibTransId="${sibTransIds[i]}"/>`
    )
    .join('');

  const presOfCxns =
    `<dgm:cxn modelId="${newModelId()}" type="presOf" srcId="${docId}" destId="${pRootId}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>` +
    nodeIds
      .map(
        (id) =>
          `<dgm:cxn modelId="${newModelId()}" type="presOf" srcId="${id}" destId="${pMainIds.get(id)}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>`
      )
      .join('') +
    sibTransIds
      .map((id, i) => `<dgm:cxn modelId="${newModelId()}" type="presOf" srcId="${id}" destId="${pSibTransIds[i]}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>`)
      .join('');

  // Interleaved Main, transition, Main, transition, … : root's presParOf srcOrd is one sequence.
  const presParOfCxns = nodeIds
    .map(
      (id, i) =>
        `<dgm:cxn modelId="${newModelId()}" type="presParOf" srcId="${pRootId}" destId="${pMainIds.get(id)}" srcOrd="${2 * i}" destOrd="0" presId="${layoutUrn}"/>` +
        `<dgm:cxn modelId="${newModelId()}" type="presParOf" srcId="${pRootId}" destId="${pSibTransIds[i]}" srcOrd="${2 * i + 1}" destOrd="0" presId="${layoutUrn}"/>`
    )
    .join('');

  const xml = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet ` +
    `loTypeId="${layoutUrn}" loCatId="cycle" ` +
    'qsTypeId="urn:md2nativedocx/smartart-quickstyle/cycle1" qsCatId="simple" ' +
    'csTypeId="urn:md2nativedocx/smartart-colors/cycle1" csCatId="accent1"/></dgm:pt>' +
    contentPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns}${presOfCxns}${presParOfCxns}</dgm:cxnLst>` +
    `<dgm:bg/><dgm:whole/>${withDrawing ? DRAWING_EXT_LST_XML : ''}</dgm:dataModel>`
  );
  if (!withDrawing) return { xml };
  const drawingXml = buildDiagramDrawingXml(
    cycleShapes(
      nodes.map((node, i) => {
        const label = incomingLabel.get(node.id);
        const fill = validateHexColor(node.fill, '');
        return {
          id: pMainIds.get(nodeIds[i] as string) as string,
          text: boxText(node, label),
          ...(nodeGeom(node) ? { geom: nodeGeom(node) } : {}),
          ...(fill ? { fill } : {}),
        };
      }),
      pSibTransIds,
      style,
    ),
    style,
  );
  return { xml, drawingXml };
}

/**
 * Generate a `cycle` SmartArt's four diagram parts for `flowchart`.
 *
 * `flowchart` must already have been classified `cycle` by
 * {@link classifyTopology} (`./classify.ts`) — this function does not
 * re-run that check, and produces undefined results (or throws, via
 * {@link orderedCycleNodes}) on a flowchart that isn't actually a closed
 * loop.
 *
 * Unlike `chain`/`tree`, there is no direction-dependent layout variant: a
 * circle has no "top-to-bottom" or "left-to-right" orientation to mirror
 * Mermaid's `TD`/`LR`, so a single fixed layout covers both.
 */
export function generateCycle(flowchart: Flowchart, options: SmartArtGenerateOptions = {}): SmartArtCycleOutput {
  const style: SmartArtStyle = options.style ?? 'simple';
  const nodes = orderedCycleNodes(flowchart);
  const data = buildCycleDataXml(flowchart, nodes, options.drawing === true, style);
  return {
    dataXml: data.xml,
    layoutXml: cycleLayoutXml(nodes.length),
    frame: CYCLE_FRAME,
    colorsXml:
      style === 'simple'
        ? CYCLE_COLORS_XML
        : buildColorsXml(style, 'urn:md2nativedocx/smartart-colors/cycle1', ['node1', 'sibTrans']),
    styleXml:
      style === 'simple'
        ? CYCLE_STYLE_XML
        : buildStyleXml(style, 'urn:md2nativedocx/smartart-quickstyle/cycle1', ['node1', 'sibTrans']),
    ...(data.drawingXml !== undefined ? { drawingXml: data.drawingXml } : {}),
  };
}
