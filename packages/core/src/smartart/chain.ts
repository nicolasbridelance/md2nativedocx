/**
 * SmartArt generator for the `chain` topology (`docs/specs/FUTURE_mmd2smartart_SPEC.md`
 * §7 step 4; classification comes from {@link classifyTopology} in
 * `./classify.ts`, not repeated here).
 *
 * Produces all four OOXML diagram parts a `chain` SmartArt needs:
 * `data`, `layout`, `colors`, `style` (quickStyle). All four are original —
 * none of them are copied from, or byte-derived from, any real Word-emitted
 * file. This is a deliberate, verified constraint, not an implementation
 * shortcut: `docs/adr/0004-smartart-feasibility-spike.md` ("Round 5") shows
 * that reusing Word's own built-in `hierarchy1` algorithm would mean
 * redistributing Microsoft's proprietary algorithm XML in this CC0 public
 * repo — a licensing risk the maintainer explicitly declined — and that a
 * fully self-authored algorithm renders identically in both Word and
 * LibreOffice, provided all four parts below are present together. Omitting
 * any one of them (particularly `colors`/`style`) reproduces the "text
 * renders, no shapes" degradation documented in that same spike.
 *
 * The `layout`/`colors`/`style` XML are constants: they encode the
 * *algorithm*, which does not depend on any particular Mermaid diagram.
 * Only `data` is generated per-diagram, from the chain's ordered node list.
 */

import type { Flowchart, FlowNode } from '../types.js';
import { escapeXml, validateHexColor } from '../translator/xml-escape.js';

/** The four OOXML diagram parts a `chain` SmartArt diagram needs. */
export interface SmartArtChainOutput {
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

/** `layoutDef` URN for the horizontal (Mermaid `LR`) chain variant. */
export const CHAIN_LAYOUT_URN = 'urn:md2nativedocx/smartart-layout/chain1';
/** `layoutDef` URN for the vertical (Mermaid `TD`) chain variant (§ below). */
export const CHAIN_LAYOUT_TD_URN = 'urn:md2nativedocx/smartart-layout/chain1-td';

/**
 * Original `dgm:layoutDef` for a horizontal chain of boxes (`lin` algorithm,
 * one `composite`/`Main` pair per node via `forEach axis="ch"`, one `sibTrans`
 * spacer between consecutive items via `forEach axis="followSib"`).
 * Transcribed from Microsoft's own publicly documented "Basic Block List"
 * tutorial example ("Creating Custom SmartArt Layouts with Office Open XML",
 * learn.microsoft.com/en-us/previous-versions/office/developer/office-2010/gg583880),
 * not from any real Word-emitted diagram — see ADR 0004 "Round 5" for the
 * verification history (`custom-chain1.docx`, confirmed rendering correctly
 * in real Word).
 */
export const CHAIN_LAYOUT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${CHAIN_LAYOUT_URN}">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="list" pri="1"/></dgm:catLst>' +
  '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
  '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
  '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
  '<dgm:layoutNode name="root">' +
  '<dgm:alg type="lin"/><dgm:shape/>' +
  '<dgm:constrLst>' +
  '<dgm:constr op="equ" type="primFontSz" for="des" ptType="node" val="20"/>' +
  '<dgm:constr type="w" for="ch" forName="composite" refType="w"/>' +
  '<dgm:constr type="h" for="ch" forName="composite" refType="h"/>' +
  '<dgm:constr op="equ" type="sp" refType="w" refFor="ch" refForName="composite" fact="0.1"/>' +
  '<dgm:constr op="equ" type="w" for="ch" forName="sibTrans" refType="w" refFor="ch" refForName="composite" fact="0.1"/>' +
  '<dgm:constr op="equ" type="h" for="ch" forName="sibTrans" refType="w" refFor="ch" refForName="sibTrans"/>' +
  '</dgm:constrLst>' +
  '<dgm:forEach name="nodesForEach" axis="ch" ptType="node">' +
  '<dgm:layoutNode name="composite">' +
  '<dgm:alg type="composite"><dgm:param type="ar" val="1.6667"/></dgm:alg>' +
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
  '<dgm:forEach name="sibTransForEach" axis="followSib" ptType="sibTrans" cnt="1">' +
  '<dgm:layoutNode name="sibTrans"><dgm:alg type="sp"/><dgm:shape/></dgm:layoutNode>' +
  '</dgm:forEach>' +
  '</dgm:layoutNode>' +
  '</dgm:layoutDef>';

/**
 * The vertical (Mermaid `TD`) variant of {@link CHAIN_LAYOUT_XML}: identical
 * except for its `uniqueId` and a `<dgm:param type="linDir" val="fromT"/>` on
 * the root `lin` algorithm, which switches its stacking axis from
 * left-to-right (the format's own default) to top-to-bottom. Derived by
 * string substitution rather than duplicated by hand, so the two variants
 * can never drift apart on anything but direction. Verified this session by
 * rendering the substituted XML under headless LibreOffice — three boxes
 * stacked vertically, spacing/styling otherwise identical to the horizontal
 * variant.
 *
 * Before this, neither `chain.ts` nor `tree.ts` (below) read
 * `flowchart.direction` at all — every chain rendered horizontally
 * regardless of the Mermaid source's `TD`/`LR`, a gap first written up in
 * `docs/smartart-compliance-table.md`.
 */
export const CHAIN_LAYOUT_XML_TD = CHAIN_LAYOUT_XML.replace(
  `uniqueId="${CHAIN_LAYOUT_URN}"`,
  `uniqueId="${CHAIN_LAYOUT_TD_URN}"`
).replace('<dgm:alg type="lin"/>', '<dgm:alg type="lin"><dgm:param type="linDir" val="fromT"/></dgm:alg>');

/**
 * Original `dgm:colorsDef` — two `styleLbl`s (`node0`/`node1`, both used by
 * {@link CHAIN_LAYOUT_XML}'s single `Main` layoutNode) with plain solid
 * fills. Written directly from the public ECMA-376/Open-XML-SDK schema
 * (`ColorsDefinition`/`ColorTransformStyleLabel` classes), not extracted
 * from any real Word document — verified in `custom-chain1-ownercolors.docx`
 * (ADR 0004 "Round 5").
 */
export const CHAIN_COLORS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:colorsDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:md2nativedocx/smartart-colors/chain1" minVer="12.0">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="mainScheme" pri="1"/></dgm:catLst>' +
  '<dgm:styleLbl name="node0">' +
  '<dgm:fillClrLst><a:schemeClr val="accent1"/></dgm:fillClrLst>' +
  '<dgm:linClrLst><a:schemeClr val="accent1"><a:shade val="75000"/></a:schemeClr></dgm:linClrLst>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
  '<dgm:txFillClrLst><a:schemeClr val="bg1"/></dgm:txFillClrLst>' +
  '<dgm:txEffectClrLst/>' +
  '</dgm:styleLbl>' +
  '<dgm:styleLbl name="node1">' +
  '<dgm:fillClrLst><a:schemeClr val="accent1"/></dgm:fillClrLst>' +
  '<dgm:linClrLst><a:schemeClr val="accent1"><a:shade val="75000"/></a:schemeClr></dgm:linClrLst>' +
  '<dgm:effectClrLst/><dgm:txLinClrLst/>' +
  '<dgm:txFillClrLst><a:schemeClr val="bg1"/></dgm:txFillClrLst>' +
  '<dgm:txEffectClrLst/>' +
  '</dgm:styleLbl>' +
  '</dgm:colorsDef>';

/**
 * Original `dgm:styleDef` — same two `styleLbl`s, each a plain
 * `lnRef`/`fillRef`/`effectRef`/`fontRef` reference into the host document's
 * theme (the same reference-based style vocabulary `ooxml-translator.ts`
 * already uses for `wps:style` in the `.docx` shape translator). Verified in
 * `custom-chain1-ownerstyle.docx` (ADR 0004 "Round 5") — renders identically
 * to Word's own `quickStyle1.xml`.
 */
export const CHAIN_STYLE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:styleDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:md2nativedocx/smartart-quickstyle/chain1" minVer="12.0">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="simple" pri="1"/></dgm:catLst>' +
  '<dgm:styleLbl name="node0">' +
  '<dgm:style>' +
  '<a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef>' +
  '<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>' +
  '<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>' +
  '</dgm:style>' +
  '</dgm:styleLbl>' +
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
 * Order a `chain`-classified flowchart's nodes from start to end, by
 * following `from -> to` edges starting at the node with no incoming edge.
 * Assumes the flowchart has already been confirmed `chain`-eligible by
 * {@link classifyTopology} in `./classify.ts` (every node in-degree/out-degree
 * <= 1, connected, exactly one node with in-degree 0) — this function does
 * not re-validate that, it would misorder or drop nodes silently on a
 * flowchart that doesn't actually satisfy it.
 */
function orderedChainNodes(flowchart: Flowchart): FlowNode[] {
  const byId = new Map(flowchart.nodes.map((n) => [n.id, n]));
  const nextId = new Map(flowchart.edges.map((e) => [e.from, e.to]));
  const hasIncoming = new Set(flowchart.edges.map((e) => e.to));

  const startNode = flowchart.nodes.find((n) => !hasIncoming.has(n.id));
  if (!startNode) {
    throw new Error(
      'orderedChainNodes: no node with in-degree 0 -- flowchart is not a valid chain'
    );
  }

  const ordered: FlowNode[] = [];
  let currentId: string | undefined = startNode.id;
  while (currentId !== undefined) {
    const node = byId.get(currentId);
    if (!node) break;
    ordered.push(node);
    currentId = nextId.get(currentId);
  }
  return ordered;
}

/**
 * Map each node id to the label of the (single, since `chain` guarantees
 * in-degree <= 1) edge that leads into it, if that edge has one. Used to
 * apply the spec §5.2 convention below — an edge label has no native
 * SmartArt connector to sit on, so it's folded into the destination node's
 * own text instead.
 */
function incomingLabelByNodeId(flowchart: Flowchart): Map<string, string> {
  const labels = new Map<string, string>();
  for (const edge of flowchart.edges) {
    if (edge.label) labels.set(edge.to, edge.label);
  }
  return labels;
}

/**
 * Build the `dgm:dataModel` for a chain of `nodes`, including the hand-built
 * `presOf`/`presParOf` presentation mirror {@link CHAIN_LAYOUT_XML}'s own
 * `root`/`composite`/`Main` layoutNodes need to render under LibreOffice
 * (ADR 0004 "Round 5" — Word alone can resolve this dynamically via
 * `forEach`, but LibreOffice does not execute `forEach`/`presOf` and only
 * displays whatever presentation mirror is already present in the data).
 *
 * modelIds are synthetic (`"0"`, `"1"`, `"2"`, ... for content nodes; `"p-*"`
 * for presentation nodes) rather than derived from the Mermaid node ids —
 * simpler to keep XML-attribute-safe, and ADR 0004 "Round 3" confirmed
 * modelId format has no effect on rendering. Node text is the only
 * user-controlled content and is XML-escaped (rule #2).
 *
 * Includes a `presOf` connector from the `doc` point itself to `p-root` (in
 * addition to the per-node `presOf`s onto each `p-main*`) even though the
 * doc point carries no text: LibreOffice renders a fully blank diagram
 * (correct XML shape, zero visible output) without it, discovered by
 * rendering this function's own output under headless LibreOffice rather
 * than only asserting on the XML string, which had been this module's only
 * verification up to that point.
 *
 * Two more things folded in here, both verified by rendering the actual
 * output under headless LibreOffice rather than by XML-structure tests
 * alone (session that built `docs/smartart-compliance-table.md`):
 *  - `edge.label` (spec §5.2 convention): prefixed as `"label : "` onto the
 *    destination node's own text, since SmartArt has no connector text box
 *    and we don't control connector geometry to place a floating one.
 *  - `node.fill` (from `classDef`): written as an `a:solidFill` on the
 *    **content** point's own `dgm:spPr` — confirmed this session to render
 *    correctly under LibreOffice, unlike the identical override attempted on
 *    a *presentation* point in ADR 0004 "Round 5" ("no visual effect"). A
 *    matching `a:prstGeom` shape override on this same content-point `spPr`
 *    was tested the same way and confirmed **not** to render (stays
 *    `roundRect` regardless) — not attempted here for that reason.
 */
function buildChainDataXml(flowchart: Flowchart, nodes: FlowNode[], layoutUrn: string): string {
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
    `<dgm:cxn modelId="po${docId}" type="presOf" srcId="${docId}" destId="p-root" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>` +
    nodeIds
      .map(
        (id) =>
          `<dgm:cxn modelId="po${id}" type="presOf" srcId="${id}" destId="p-main${id}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>`
      )
      .join('');

  const presParOfCxns = nodeIds
    .map(
      (id, i) =>
        `<dgm:cxn modelId="pp${id}a" type="presParOf" srcId="p-root" destId="p-composite${id}" srcOrd="${i}" destOrd="0" presId="${layoutUrn}"/>` +
        `<dgm:cxn modelId="pp${id}b" type="presParOf" srcId="p-composite${id}" destId="p-main${id}" srcOrd="0" destOrd="0" presId="${layoutUrn}"/>`
    )
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet ` +
    `loTypeId="${layoutUrn}" loCatId="list" ` +
    'qsTypeId="urn:md2nativedocx/smartart-quickstyle/chain1" qsCatId="simple" ' +
    'csTypeId="urn:md2nativedocx/smartart-colors/chain1" csCatId="accent1"/></dgm:pt>' +
    contentPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns}${presOfCxns}${presParOfCxns}</dgm:cxnLst>` +
    '<dgm:bg/><dgm:whole/></dgm:dataModel>'
  );
}

/**
 * Generate a `chain` SmartArt's four diagram parts for `flowchart`.
 *
 * `flowchart` must already have been classified `chain` by
 * {@link classifyTopology} (`./classify.ts`) — this function does not
 * re-run that check, and produces undefined results (or throws, via
 * {@link orderedChainNodes}) on a flowchart that isn't actually a simple
 * path.
 *
 * Picks the horizontal ({@link CHAIN_LAYOUT_XML}) or vertical
 * ({@link CHAIN_LAYOUT_XML_TD}) layout variant from `flowchart.direction` —
 * before this, the generator always emitted the horizontal layout,
 * regardless of the Mermaid source's own `TD`/`LR` (see
 * `docs/smartart-compliance-table.md`).
 */
export function generateChain(flowchart: Flowchart): SmartArtChainOutput {
  const nodes = orderedChainNodes(flowchart);
  const isVertical = flowchart.direction === 'TD';
  const layoutXml = isVertical ? CHAIN_LAYOUT_XML_TD : CHAIN_LAYOUT_XML;
  const layoutUrn = isVertical ? CHAIN_LAYOUT_TD_URN : CHAIN_LAYOUT_URN;
  return {
    dataXml: buildChainDataXml(flowchart, nodes, layoutUrn),
    layoutXml,
    colorsXml: CHAIN_COLORS_XML,
    styleXml: CHAIN_STYLE_XML,
  };
}
