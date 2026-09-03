/**
 * SmartArt generator for the `tree` topology (`docs/specs/FUTURE_mmd2smartart_SPEC.md`
 * §7 step 4; classification comes from {@link classifyTopology} in
 * `./classify.ts`, not repeated here).
 *
 * Produces all four OOXML diagram parts a `tree` SmartArt needs: `data`,
 * `layout`, `colors`, `style` — same four-part recipe as `chain.ts` (ADR 0004
 * "Round 5"), all original, none copied from or derived from a real
 * Word-emitted file.
 *
 * **Scope: depth-2 trees only** (a root plus a single row of direct
 * children — `classify.ts`'s `MAX_TREE_DEPTH` is 2 for exactly this reason).
 * The fixed `layoutDef` below reserves a static height split (35% node /
 * 55% children row) at its one nesting level; naively repeating that split
 * at further nesting levels would misallocate space for any node that
 * doesn't actually have grandchildren, since the split is static rather
 * than computed from the real subtree shape the way Word's own built-in
 * `hierarchy1` is. Supporting depth > 2 needs a different, size-aware
 * scheme, not just more copy-pasted levels of the same template.
 */

import type { Flowchart, FlowNode } from '../types.js';
import { escapeXml, validateHexColor } from '../translator/xml-escape.js';

/** The four OOXML diagram parts a `tree` SmartArt diagram needs. */
export interface SmartArtTreeOutput {
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

/** `layoutDef` URN for the vertical (Mermaid `TD`: root-on-top) tree variant. */
export const TREE_LAYOUT_URN = 'urn:md2nativedocx/smartart-layout/tree1';
/** `layoutDef` URN for the horizontal (Mermaid `LR`: root-on-left) tree variant. */
export const TREE_LAYOUT_LR_URN = 'urn:md2nativedocx/smartart-layout/tree1-lr';

/**
 * Original `dgm:layoutDef` for a 2-level tree: one root box (`level1Main`,
 * styled `node1`) above a `lin`-distributed row of an arbitrary number of
 * child boxes (`level2Main`, styled `node2`). `root`/`level1` use the
 * `composite` algorithm with fixed-fraction constraints (`refType`+`fact`,
 * e.g. the child row is pinned to the bottom 55% of `level1`'s own height)
 * — the same technique real hierarchy-style SmartArt layouts use to
 * position a background/text pair, adapted to a text-box/children-row pair.
 *
 * Verified empirically by rendering this exact XML under headless
 * LibreOffice with a hand-built `presOf`/`presParOf` mirror (this session,
 * `docs/adr/spikes/spike-smartart/custom-algo/`): renders a root box above
 * a correctly-styled 2-box child row. Two bugs found and fixed en route,
 * both against the file that had shipped in the spike, neither ever caught
 * by the (XML-structure-only) unit test suite:
 *  1. Every `dgm:constr` here originally used a fixed `val` (e.g. `val="0.35"`)
 *     to mean "35% of the parent" — `val` is a literal number, not a
 *     fraction; every box in the diagram had a near-zero physical size,
 *     invisible in LibreOffice and reported as "no shapes" in Word. Fixed
 *     by switching to `refType="h" fact="0.35"` (relative-to-parent), the
 *     idiom actually used for proportional constraints.
 *  2. The data model needs a `presOf` connecting the `doc` point itself to
 *     the `p-root` presentation point (see `buildTreeDataXml` below) — see
 *     `chain.ts`'s identical fix for the shared root cause.
 */
export const TREE_LAYOUT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${TREE_LAYOUT_URN}">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="hierarchy" pri="1"/></dgm:catLst>' +
  '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
  '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
  '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
  '<dgm:layoutNode name="root">' +
  '<dgm:alg type="composite"/><dgm:shape/>' +
  '<dgm:constrLst>' +
  '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="20"/>' +
  '<dgm:constr type="w" for="ch" forName="level1" refType="w"/>' +
  '<dgm:constr type="h" for="ch" forName="level1" refType="h"/>' +
  '<dgm:constr type="t" for="ch" forName="level1" val="0"/>' +
  '<dgm:constr type="l" for="ch" forName="level1" val="0"/>' +
  '</dgm:constrLst>' +
  '<dgm:forEach name="rootForEach" axis="ch" ptType="node" st="1" cnt="1">' +
  '<dgm:layoutNode name="level1">' +
  '<dgm:alg type="composite"/><dgm:shape/>' +
  '<dgm:constrLst>' +
  '<dgm:constr type="w" for="ch" forName="level1Main" refType="w"/>' +
  '<dgm:constr type="h" for="ch" forName="level1Main" refType="h" fact="0.35"/>' +
  '<dgm:constr type="t" for="ch" forName="level1Main" val="0"/>' +
  '<dgm:constr type="l" for="ch" forName="level1Main" val="0"/>' +
  '<dgm:constr type="w" for="ch" forName="level1Children" refType="w"/>' +
  '<dgm:constr type="h" for="ch" forName="level1Children" refType="h" fact="0.55"/>' +
  '<dgm:constr type="t" for="ch" forName="level1Children" refType="h" fact="0.45"/>' +
  '<dgm:constr type="l" for="ch" forName="level1Children" val="0"/>' +
  '</dgm:constrLst>' +
  '<dgm:layoutNode name="level1Main" styleLbl="node1">' +
  '<dgm:alg type="tx"/><dgm:shape type="roundRect"/>' +
  '<dgm:presOf axis="desOrSelf" ptType="node" st="1" cnt="0"/>' +
  '<dgm:constrLst>' +
  '<dgm:constr type="lMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="rMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="tMarg" refType="primFontSz" fact="0.15"/>' +
  '<dgm:constr type="bMarg" refType="primFontSz" fact="0.15"/>' +
  '</dgm:constrLst>' +
  '<dgm:ruleLst><dgm:rule type="primFontSz" val="5"/></dgm:ruleLst>' +
  '</dgm:layoutNode>' +
  '<dgm:layoutNode name="level1Children">' +
  '<dgm:alg type="lin"/><dgm:shape/>' +
  '<dgm:constrLst>' +
  '<dgm:constr type="w" for="ch" forName="level2composite" refType="w"/>' +
  '<dgm:constr type="h" for="ch" forName="level2composite" refType="h"/>' +
  '<dgm:constr op="equ" type="sp" refType="w" refFor="ch" refForName="level2composite" fact="0.1"/>' +
  '</dgm:constrLst>' +
  '<dgm:forEach name="level2ForEach" axis="ch" ptType="node">' +
  '<dgm:layoutNode name="level2composite">' +
  '<dgm:alg type="composite"/><dgm:shape/>' +
  '<dgm:layoutNode name="level2Main" styleLbl="node2">' +
  '<dgm:alg type="tx"/><dgm:shape type="roundRect"/>' +
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
  '</dgm:layoutNode>' +
  '</dgm:forEach>' +
  '</dgm:layoutNode>' +
  '</dgm:layoutDef>';

/**
 * The horizontal (Mermaid `LR`: root-on-left, children stacked in a column)
 * variant of {@link TREE_LAYOUT_XML}. Derived by string substitution, not
 * duplicated by hand (same rationale as `chain.ts`'s `CHAIN_LAYOUT_XML_TD`):
 * the vertical variant's `level1Main`/`level1Children` fractional
 * width/height/top/left constraints are swapped (top strip + bottom area ->
 * left strip + right area), and `level1Children`'s inner `lin` gets
 * `<dgm:param type="linDir" val="fromT"/>` so its row becomes a column.
 * Verified this session by rendering the substituted XML under headless
 * LibreOffice: root box on the left, three correctly-styled child boxes
 * stacked vertically on the right.
 */
export const TREE_LAYOUT_XML_LR = TREE_LAYOUT_XML.replace(
  `uniqueId="${TREE_LAYOUT_URN}"`,
  `uniqueId="${TREE_LAYOUT_LR_URN}"`
)
  .replace(
    '<dgm:constr type="w" for="ch" forName="level1Main" refType="w"/>' +
      '<dgm:constr type="h" for="ch" forName="level1Main" refType="h" fact="0.35"/>' +
      '<dgm:constr type="t" for="ch" forName="level1Main" val="0"/>' +
      '<dgm:constr type="l" for="ch" forName="level1Main" val="0"/>' +
      '<dgm:constr type="w" for="ch" forName="level1Children" refType="w"/>' +
      '<dgm:constr type="h" for="ch" forName="level1Children" refType="h" fact="0.55"/>' +
      '<dgm:constr type="t" for="ch" forName="level1Children" refType="h" fact="0.45"/>' +
      '<dgm:constr type="l" for="ch" forName="level1Children" val="0"/>',
    '<dgm:constr type="w" for="ch" forName="level1Main" refType="w" fact="0.35"/>' +
      '<dgm:constr type="h" for="ch" forName="level1Main" refType="h"/>' +
      '<dgm:constr type="t" for="ch" forName="level1Main" val="0"/>' +
      '<dgm:constr type="l" for="ch" forName="level1Main" val="0"/>' +
      '<dgm:constr type="w" for="ch" forName="level1Children" refType="w" fact="0.55"/>' +
      '<dgm:constr type="h" for="ch" forName="level1Children" refType="h"/>' +
      '<dgm:constr type="t" for="ch" forName="level1Children" val="0"/>' +
      '<dgm:constr type="l" for="ch" forName="level1Children" refType="w" fact="0.45"/>'
  )
  .replace(
    '<dgm:layoutNode name="level1Children"><dgm:alg type="lin"/><dgm:shape/>',
    '<dgm:layoutNode name="level1Children"><dgm:alg type="lin"><dgm:param type="linDir" val="fromT"/></dgm:alg><dgm:shape/>'
  );

/**
 * Original `dgm:colorsDef` — two `styleLbl`s (`node1` for the root,
 * `node2` for children), theme-linked `a:schemeClr` fills so the diagram
 * matches the host document's theme (spec §10.4) rather than imposing a
 * fixed palette. Written from the public ECMA-376/Open-XML-SDK schema, no
 * Microsoft content.
 */
export const TREE_COLORS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:colorsDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:md2nativedocx/smartart-colors/tree1" minVer="12.0">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="mainScheme" pri="1"/></dgm:catLst>' +
  '<dgm:styleLbl name="node1">' +
  '<dgm:fillClrLst><a:schemeClr val="accent1"/></dgm:fillClrLst>' +
  '<dgm:linClrLst><a:schemeClr val="accent1"><a:shade val="75000"/></a:schemeClr></dgm:linClrLst>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
  '<dgm:txFillClrLst><a:schemeClr val="bg1"/></dgm:txFillClrLst>' +
  '<dgm:txEffectClrLst/>' +
  '</dgm:styleLbl>' +
  '<dgm:styleLbl name="node2">' +
  '<dgm:fillClrLst><a:schemeClr val="accent2"/></dgm:fillClrLst>' +
  '<dgm:linClrLst><a:schemeClr val="accent2"><a:shade val="75000"/></a:schemeClr></dgm:linClrLst>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
  '<dgm:txFillClrLst><a:schemeClr val="bg1"/></dgm:txFillClrLst>' +
  '<dgm:txEffectClrLst/>' +
  '</dgm:styleLbl>' +
  '</dgm:colorsDef>';

/**
 * Original `dgm:styleDef` — same two `styleLbl`s, reference-based
 * `lnRef`/`fillRef`/`effectRef`/`fontRef` styling into the host theme (the
 * same vocabulary `ooxml-translator.ts` already uses for `wps:style`, and
 * `chain.ts`'s `CHAIN_STYLE_XML` uses for `chain`).
 */
export const TREE_STYLE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:styleDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:md2nativedocx/smartart-quickstyle/tree1" minVer="12.0">` +
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
  '<dgm:styleLbl name="node2">' +
  '<dgm:style>' +
  '<a:lnRef idx="0"><a:schemeClr val="accent2"/></a:lnRef>' +
  '<a:fillRef idx="1"><a:schemeClr val="accent2"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:schemeClr val="accent2"/></a:effectRef>' +
  '<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>' +
  '</dgm:style>' +
  '</dgm:styleLbl>' +
  '</dgm:styleDef>';

/**
 * Split a `tree`-classified flowchart into its root and direct children.
 * Assumes the flowchart has already been confirmed `tree`-eligible by
 * {@link classifyTopology} (`./classify.ts`) at depth <= 2 — this function
 * does not re-validate that; a flowchart with a grandchild (depth 3) would
 * silently drop it, since only edges from the root are followed.
 */
function rootAndChildren(flowchart: Flowchart): { root: FlowNode; children: FlowNode[] } {
  const hasIncoming = new Set(flowchart.edges.map((e) => e.to));
  const root = flowchart.nodes.find((n) => !hasIncoming.has(n.id));
  if (!root) {
    throw new Error('rootAndChildren: no node with in-degree 0 -- flowchart is not a valid tree');
  }

  const byId = new Map(flowchart.nodes.map((n) => [n.id, n]));
  const childIds = flowchart.edges.filter((e) => e.from === root.id).map((e) => e.to);
  const children = childIds.map((id) => {
    const node = byId.get(id);
    if (!node) throw new Error(`rootAndChildren: edge references unknown node "${id}"`);
    return node;
  });

  return { root, children };
}

/**
 * Map each node id to the label of the (single) edge that leads into it, if
 * that edge has one. Same convention and rationale as `chain.ts`'s identical
 * helper — spec §5.2: fold an edge label into the destination node's own
 * text, since SmartArt has no connector text box.
 */
function incomingLabelByNodeId(flowchart: Flowchart): Map<string, string> {
  const labels = new Map<string, string>();
  for (const edge of flowchart.edges) {
    if (edge.label) labels.set(edge.to, edge.label);
  }
  return labels;
}

/** `<dgm:spPr/>`, or with an `a:solidFill` override when `fill` validates as hex. */
function spPrFor(fill: string | undefined): string {
  const validated = validateHexColor(fill, '');
  return validated
    ? `<dgm:spPr><a:solidFill><a:srgbClr val="${validated}"/></a:solidFill></dgm:spPr>`
    : '<dgm:spPr/>';
}

/**
 * Build the `dgm:dataModel` for a root node and its direct children,
 * including the hand-built `presOf`/`presParOf` presentation mirror
 * {@link TREE_LAYOUT_XML}'s own `root`/`level1`/`level1Main`/
 * `level1Children`/`level2composite`/`level2Main` layoutNodes need to
 * render under LibreOffice (same requirement as `chain.ts`, ADR 0004
 * "Round 5") — including the `doc`-point-to-`p-root` `presOf` that fixes
 * the blank-render bug documented on {@link TREE_LAYOUT_XML}.
 *
 * Also folds in `edge.label` (root -> child) and `node.fill` (`classDef`),
 * both verified this session by rendering the actual output under headless
 * LibreOffice — see `chain.ts`'s identical additions for the full rationale
 * (`node.fill` renders correctly as a content-point `spPr` override; a
 * matching shape override does not and is not attempted here).
 */
function buildTreeDataXml(flowchart: Flowchart, root: FlowNode, children: FlowNode[], layoutUrn: string): string {
  const docId = '0';
  const rootId = '1';
  const childIds = children.map((_, i) => String(i + 2));
  const incomingLabel = incomingLabelByNodeId(flowchart);

  const rootPt =
    `<dgm:pt modelId="${rootId}"><dgm:prSet phldrT="[Texte]"/>${spPrFor(root.fill)}` +
    `<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/>` +
    `<a:t>${escapeXml(root.label)}</a:t></a:r></a:p></dgm:t></dgm:pt>`;

  const childPts = children
    .map((node, i) => {
      const label = incomingLabel.get(node.id);
      const text = label ? `${label} : ${node.label}` : node.label;
      return (
        `<dgm:pt modelId="${childIds[i]}"><dgm:prSet phldrT="[Texte]"/>${spPrFor(node.fill)}` +
        `<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/>` +
        `<a:t>${escapeXml(text)}</a:t></a:r></a:p></dgm:t></dgm:pt>`
      );
    })
    .join('');

  const presPts =
    `<dgm:pt modelId="p-root" type="pres"><dgm:prSet presAssocID="${docId}" presName="root" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="p-level1" type="pres"><dgm:prSet presAssocID="${rootId}" presName="level1" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="p-level1main" type="pres"><dgm:prSet presAssocID="${rootId}" presName="level1Main" presStyleLbl="node1" presStyleIdx="0" presStyleCnt="1"/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="p-level1children" type="pres"><dgm:prSet presAssocID="${rootId}" presName="level1Children" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    childIds
      .map(
        (id, i) =>
          `<dgm:pt modelId="p-level2composite-${id}" type="pres"><dgm:prSet presAssocID="${id}" presName="level2composite" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
          `<dgm:pt modelId="p-level2main-${id}" type="pres"><dgm:prSet presAssocID="${id}" presName="level2Main" presStyleLbl="node2" presStyleIdx="${i}" presStyleCnt="${childIds.length}"/><dgm:spPr/></dgm:pt>`
      )
      .join('');

  const parOfCxns =
    `<dgm:cxn modelId="c1" type="parOf" srcId="${docId}" destId="${rootId}" srcOrd="0" destOrd="0"/>` +
    childIds
      .map((id, i) => `<dgm:cxn modelId="c${id}" type="parOf" srcId="${rootId}" destId="${id}" srcOrd="${i}" destOrd="0"/>`)
      .join('');

  const presOfCxns =
    `<dgm:cxn modelId="po${docId}" type="presOf" srcId="${docId}" destId="p-root" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>` +
    `<dgm:cxn modelId="po${rootId}" type="presOf" srcId="${rootId}" destId="p-level1main" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>` +
    childIds
      .map(
        (id) =>
          `<dgm:cxn modelId="po${id}" type="presOf" srcId="${id}" destId="p-level2main-${id}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>`
      )
      .join('');

  const presParOfCxns =
    `<dgm:cxn modelId="pp1" type="presParOf" srcId="p-root" destId="p-level1" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>` +
    `<dgm:cxn modelId="pp2" type="presParOf" srcId="p-level1" destId="p-level1main" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>` +
    `<dgm:cxn modelId="pp3" type="presParOf" srcId="p-level1" destId="p-level1children" srcOrd="1" destOrd="0" presId="${layoutUrn}"/>` +
    childIds
      .map(
        (id, i) =>
          `<dgm:cxn modelId="pp4-${id}" type="presParOf" srcId="p-level1children" destId="p-level2composite-${id}" srcOrd="${i}" destOrd="0" presId="${layoutUrn}"/>` +
          `<dgm:cxn modelId="pp5-${id}" type="presParOf" srcId="p-level2composite-${id}" destId="p-level2main-${id}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>`
      )
      .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet ` +
    `loTypeId="${layoutUrn}" loCatId="hierarchy" ` +
    'qsTypeId="urn:md2nativedocx/smartart-quickstyle/tree1" qsCatId="simple" ' +
    'csTypeId="urn:md2nativedocx/smartart-colors/tree1" csCatId="accent1"/></dgm:pt>' +
    rootPt +
    childPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns}${presOfCxns}${presParOfCxns}</dgm:cxnLst>` +
    '<dgm:bg/><dgm:whole/></dgm:dataModel>'
  );
}

/**
 * Generate a `tree` SmartArt's four diagram parts for `flowchart`.
 *
 * `flowchart` must already have been classified `tree` by
 * {@link classifyTopology} (`./classify.ts`) — this function does not
 * re-run that check, and produces undefined results (or throws, via
 * {@link rootAndChildren}) on a flowchart that isn't actually a depth-2 tree.
 *
 * Picks the vertical ({@link TREE_LAYOUT_XML}, root-on-top) or horizontal
 * ({@link TREE_LAYOUT_XML_LR}, root-on-left) layout variant from
 * `flowchart.direction` — before this, the generator always emitted the
 * vertical layout regardless of the Mermaid source's own `TD`/`LR` (see
 * `docs/smartart-compliance-table.md`).
 */
export function generateTree(flowchart: Flowchart): SmartArtTreeOutput {
  const { root, children } = rootAndChildren(flowchart);
  const isHorizontal = flowchart.direction === 'LR';
  const layoutXml = isHorizontal ? TREE_LAYOUT_XML_LR : TREE_LAYOUT_XML;
  const layoutUrn = isHorizontal ? TREE_LAYOUT_LR_URN : TREE_LAYOUT_URN;
  return {
    dataXml: buildTreeDataXml(flowchart, root, children, layoutUrn),
    layoutXml,
    colorsXml: TREE_COLORS_XML,
    styleXml: TREE_STYLE_XML,
  };
}
