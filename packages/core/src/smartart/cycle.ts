/**
 * SmartArt generator for the `cycle` topology (`FUTURE_mmd2smartart_SPEC.md`
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
 * LibreOffice (session that built `docs/smartart-compliance-table.md`):
 * a 4-node cycle rendered as 4 correctly-styled boxes at top/right/bottom/
 * left, in the right order, first try — no geometry bug like `tree.ts` hit.
 * Same known limitation as `chain`/`tree`: no connector line is drawn
 * between the boxes, only their circular position conveys the relationship.
 */

import type { Flowchart, FlowNode } from '../types.js';
import { escapeXml, validateHexColor } from '../translator/xml-escape.js';

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
}

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** `layoutDef` URN for the cycle algorithm (direction-independent — see module doc comment on `generateCycle`). */
export const CYCLE_LAYOUT_URN = 'urn:md2nativedocx/smartart-layout/cycle1';

/**
 * Original `dgm:layoutDef`: a `cycle` algorithm root, one `composite`/`Main`
 * pair per node via `forEach axis="ch"` (same leaf pattern as `chain.ts`'s
 * `CHAIN_LAYOUT_XML`), each child sized to 30% of the diagram's width via
 * the `diam` ("diameter") constraint type `cycle` expects for its children.
 * No `sibTrans` spacer nodes — `cycle` positions its children itself, it
 * doesn't need `lin`'s manual inter-item spacer.
 */
export const CYCLE_LAYOUT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${CYCLE_LAYOUT_URN}">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="cycle" pri="1"/></dgm:catLst>' +
  '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
  '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
  '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
  '<dgm:layoutNode name="root">' +
  '<dgm:alg type="cycle"/><dgm:shape/>' +
  '<dgm:constrLst>' +
  '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="20"/>' +
  '<dgm:constr type="diam" for="ch" forName="composite" refType="w" fact="0.3"/>' +
  '</dgm:constrLst>' +
  '<dgm:forEach name="nodesForEach" axis="ch" ptType="node">' +
  '<dgm:layoutNode name="composite">' +
  '<dgm:alg type="composite"/>' +
  '<dgm:shape/>' +
  '<dgm:layoutNode name="Main" styleLbl="node1">' +
  '<dgm:alg type="tx"/>' +
  '<dgm:shape type="roundRect"/>' +
  '<dgm:presOf axis="desOrSelf" ptType="node" st="1" cnt="0"/>' +
  '<dgm:constrLst>' +
  '<dgm:constr type="lMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="rMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="tMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="bMarg" refType="primFontSz" fact="0.15"/>' +
  '</dgm:constrLst>' +
  '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
  '</dgm:layoutNode>' +
  '</dgm:layoutNode>' +
  '</dgm:forEach>' +
  '</dgm:layoutNode>' +
  '</dgm:layoutDef>';

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
 * `root`/`composite`/`Main` layoutNodes need to render under LibreOffice
 * (same requirement as `chain.ts`/`tree.ts`, ADR 0004 "Round 5") — including
 * the `doc`-point-to-`p-root` `presOf` that both those modules needed to fix
 * an otherwise fully blank render.
 *
 * Also applies `edge.label` and `node.fill` the same way `chain.ts` does
 * (spec §5.2 convention; content-point `spPr` solidFill) — see that
 * module's doc comment for the full rationale and verification history.
 */
function buildCycleDataXml(flowchart: Flowchart, nodes: FlowNode[]): string {
  const docId = '0';
  const nodeIds = nodes.map((_, i) => String(i + 1));
  const incomingLabel = incomingLabelByNodeId(flowchart);

  const contentPts = nodes
    .map((node, i) => {
      const label = incomingLabel.get(node.id);
      const text = label ? `${label} : ${node.label}` : node.label;
      const fill = validateHexColor(node.fill, '');
      const spPr = fill
        ? `<dgm:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></dgm:spPr>`
        : '<dgm:spPr/>';
      return (
        `<dgm:pt modelId="${nodeIds[i]}"><dgm:prSet phldrT="[Texte]"/>${spPr}` +
        `<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/>` +
        `<a:t>${escapeXml(text)}</a:t></a:r></a:p></dgm:t></dgm:pt>`
      );
    })
    .join('');

  const presPts =
    `<dgm:pt modelId="p-root" type="pres"><dgm:prSet presAssocID="${docId}" presName="root" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    nodeIds
      .map(
        (id, i) =>
          `<dgm:pt modelId="p-composite${id}" type="pres"><dgm:prSet presAssocID="${id}" presName="composite" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
          `<dgm:pt modelId="p-main${id}" type="pres"><dgm:prSet presAssocID="${id}" presName="Main" presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${nodeIds.length}"/><dgm:spPr/></dgm:pt>`
      )
      .join('');

  const parOfCxns = nodeIds
    .map((id, i) => `<dgm:cxn modelId="c${id}" type="parOf" srcId="${docId}" destId="${id}" srcOrd="${i}" destOrd="0"/>`)
    .join('');

  const presOfCxns =
    `<dgm:cxn modelId="po${docId}" type="presOf" srcId="${docId}" destId="p-root" srcOrd="0" destOrd="0" presId="${CYCLE_LAYOUT_URN}"/>` +
    nodeIds
      .map(
        (id) =>
          `<dgm:cxn modelId="po${id}" type="presOf" srcId="${id}" destId="p-main${id}" srcOrd="0" destOrd="0" presId="${CYCLE_LAYOUT_URN}"/>`
      )
      .join('');

  const presParOfCxns = nodeIds
    .map(
      (id, i) =>
        `<dgm:cxn modelId="pp${id}a" type="presParOf" srcId="p-root" destId="p-composite${id}" srcOrd="${i}" destOrd="0" presId="${CYCLE_LAYOUT_URN}"/>` +
        `<dgm:cxn modelId="pp${id}b" type="presParOf" srcId="p-composite${id}" destId="p-main${id}" srcOrd="0" destOrd="0" presId="${CYCLE_LAYOUT_URN}"/>`
    )
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet ` +
    `loTypeId="${CYCLE_LAYOUT_URN}" loCatId="cycle" ` +
    'qsTypeId="urn:md2nativedocx/smartart-quickstyle/cycle1" qsCatId="simple" ' +
    'csTypeId="urn:md2nativedocx/smartart-colors/cycle1" csCatId="accent1"/></dgm:pt>' +
    contentPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns}${presOfCxns}${presParOfCxns}</dgm:cxnLst>` +
    '<dgm:bg/><dgm:whole/></dgm:dataModel>'
  );
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
export function generateCycle(flowchart: Flowchart): SmartArtCycleOutput {
  const nodes = orderedCycleNodes(flowchart);
  return {
    dataXml: buildCycleDataXml(flowchart, nodes),
    layoutXml: CYCLE_LAYOUT_XML,
    colorsXml: CYCLE_COLORS_XML,
    styleXml: CYCLE_STYLE_XML,
  };
}
