/**
 * SmartArt generator for `tree` topologies deeper than two levels (root + grandchildren and beyond).
 *
 * `tree.ts` handles root + one row of children with a fixed 35% / 55% height split, which cannot be
 * repeated per level without misallocating space. This generator instead uses the `hierRoot` /
 * `hierChild` layout algorithms (the ones Word's own hierarchy layouts are built on; ECMA-376 §21.4.2),
 * which size every level from the real shape of each subtree, and recurses with
 * `<dgm:forEach ref="…"/>` so one `layoutDef` serves any depth. The pre-rendered `dsp:drawing`
 * ({@link deepTreeShapes}) applies the same rule — a subtree takes the room of its leaves — so Word and
 * LibreOffice show the same cached geometry until the diagram is edited.
 *
 * The recursive node structure (connector, `hierRoot`, shape, `hierChild`, repeat) follows what
 * `handmade_samples/labeled-hierarchy-basique.docx` shows Word writing for nested levels; every name,
 * constraint value and the XML itself are written here from the public schema (ADR 0004 "Round 5").
 *
 * **Scope: top-down (`TD`) only.** The other three directions need their own `linDir`/`hierAlign`
 * parameters, not yet verified in a real Word (see {@link classifyTopology}).
 */

import type { Flowchart, FlowNode } from '../types.js';
import { escapeXml, validateHexColor } from '../translator/xml-escape.js';
import { buildColorsXml, buildStyleXml } from './styles.js';
import { TREE_COLORS_XML, TREE_STYLE_XML, type SmartArtTreeOutput } from './tree.js';
import { DRAWING_EXT_LST_XML, buildDiagramDrawingXml, deepTreeShapes, type DeepTreeNode } from './drawing.js';
import type { SmartArtGenerateOptions } from './generate-options.js';
import type { SmartArtStyle } from './styles.js';

const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** `layoutDef` URN of the multi-level (top-down) tree. */
export const TREE_DEEP_LAYOUT_URN = 'urn:md2nativedocx/smartart-layout/tree-deep1';

const SHAPE = `<dgm:shape xmlns:r="${R_NS}" r:blip=""><dgm:adjLst/></dgm:shape>`;
const BOX_MARGINS =
  '<dgm:constr type="primFontSz" val="65"/>' +
  ['t', 'b', 'l', 'r'].map((s) => `<dgm:constr type="${s}Marg" refType="primFontSz" fact="0.3"/>`).join('');
const BOX_RULE = '<dgm:ruleLst><dgm:rule type="primFontSz" val="5" fact="NaN" max="NaN"/></dgm:ruleLst>';
const HIER_VARS = '<dgm:varLst><dgm:chPref val="1"/><dgm:animOne val="branch"/><dgm:animLvl val="lvl"/></dgm:varLst>';

/** One text box layout node (`tx` algorithm, rounded rectangle). */
function boxNode(name: string, styleLbl: string): string {
  return (
    `<dgm:layoutNode name="${name}" styleLbl="${styleLbl}"><dgm:alg type="tx"/>` +
    `<dgm:shape xmlns:r="${R_NS}" type="roundRect" r:blip=""><dgm:adjLst><dgm:adj idx="1" val="0.1"/></dgm:adjLst></dgm:shape>` +
    `<dgm:presOf axis="self"/><dgm:constrLst>${BOX_MARGINS}</dgm:constrLst>${BOX_RULE}</dgm:layoutNode>`
  );
}

/**
 * `dgm:layoutDef` for a top-down tree of any depth: the root box, then (recursively) for each child a
 * connector line (`conn` on the child's `parTrans` point) and a `hierRoot` holding the child's box and the
 * `hierChild` row of *its* children. Box sizes are stated once at the top (every box the size of the root's,
 * 3:5 aspect, a level gap of 0.4 box heights) and `hierChild` shrinks them to fit the widest level.
 */
export const TREE_DEEP_LAYOUT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${TREE_DEEP_LAYOUT_URN}">` +
  '<dgm:title val=""/><dgm:desc val=""/>' +
  '<dgm:catLst><dgm:cat type="hierarchy" pri="1"/></dgm:catLst>' +
  '<dgm:sampData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData>' +
  '<dgm:styleData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData>' +
  '<dgm:clrData useDef="1"><dgm:dataModel><dgm:ptLst/><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData>' +
  '<dgm:layoutNode name="treeComposite">' +
  '<dgm:varLst><dgm:chPref val="1"/><dgm:animOne val="branch"/><dgm:animLvl val="lvl"/><dgm:resizeHandles val="exact"/></dgm:varLst>' +
  '<dgm:alg type="composite"><dgm:param type="vertAlign" val="mid"/><dgm:param type="horzAlign" val="ctr"/></dgm:alg>' +
  `${SHAPE}<dgm:presOf/>` +
  '<dgm:constrLst>' +
  '<dgm:constr type="l" for="ch" forName="treeFlow"/><dgm:constr type="t" for="ch" forName="treeFlow"/>' +
  '<dgm:constr type="r" for="ch" forName="treeFlow" refType="w"/><dgm:constr type="b" for="ch" forName="treeFlow" refType="h"/>' +
  '<dgm:constr type="w" for="des" forName="level1Main" refType="w"/>' +
  '<dgm:constr type="h" for="des" forName="level1Main" refType="w" refFor="des" refForName="level1Main" fact="0.6"/>' +
  '<dgm:constr type="w" for="des" forName="level2Main" refType="w" refFor="des" refForName="level1Main" op="equ"/>' +
  '<dgm:constr type="h" for="des" forName="level2Main" refType="h" refFor="des" refForName="level1Main" op="equ"/>' +
  '<dgm:constr type="sp" for="des" refType="h" refFor="des" refForName="level1Main" op="equ" fact="0.4"/>' +
  '<dgm:constr type="sibSp" for="des" forName="level1Children" refType="w" refFor="des" refForName="level1Main" op="equ" fact="0.3"/>' +
  '<dgm:constr type="sibSp" for="des" forName="levelNChildren" refType="sibSp" refFor="des" refForName="level1Children" op="equ"/>' +
  '</dgm:constrLst><dgm:ruleLst/>' +
  '<dgm:layoutNode name="treeFlow"><dgm:alg type="lin"><dgm:param type="linDir" val="fromT"/><dgm:param type="nodeVertAlign" val="t"/>' +
  '<dgm:param type="vertAlign" val="t"/><dgm:param type="nodeHorzAlign" val="ctr"/></dgm:alg>' +
  `${SHAPE}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
  `<dgm:layoutNode name="treeTop">${HIER_VARS}` +
  '<dgm:alg type="hierChild"><dgm:param type="linDir" val="fromL"/><dgm:param type="vertAlign" val="t"/></dgm:alg>' +
  `${SHAPE}<dgm:presOf/><dgm:constrLst><dgm:constr type="primFontSz" for="des" ptType="node" op="equ"/></dgm:constrLst><dgm:ruleLst/>` +
  '<dgm:forEach name="rootForEach" axis="ch" ptType="node" st="1" cnt="1">' +
  '<dgm:layoutNode name="level1Root"><dgm:alg type="hierRoot"/>' +
  `${SHAPE}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
  boxNode('level1Main', 'node1') +
  '<dgm:layoutNode name="level1Children"><dgm:alg type="hierChild"><dgm:param type="linDir" val="fromL"/></dgm:alg>' +
  `${SHAPE}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
  '<dgm:forEach name="repeat" axis="ch">' +
  // Elbow line from the parent box to this child (same `conn` recipe as the two-level tree).
  '<dgm:forEach name="connForEach" axis="self" ptType="parTrans" cnt="1">' +
  '<dgm:layoutNode name="levelNConn" styleLbl="parChTrans1D2">' +
  '<dgm:alg type="conn"><dgm:param type="dim" val="1D"/><dgm:param type="endSty" val="noArr"/><dgm:param type="connRout" val="bend"/>' +
  '<dgm:param type="begPts" val="bCtr"/><dgm:param type="endPts" val="tCtr"/></dgm:alg>' +
  `<dgm:shape xmlns:r="${R_NS}" type="conn" r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf axis="self"/>` +
  '<dgm:constrLst><dgm:constr type="w" val="1"/><dgm:constr type="h" val="1"/><dgm:constr type="begPad"/><dgm:constr type="endPad"/></dgm:constrLst>' +
  '<dgm:ruleLst/></dgm:layoutNode></dgm:forEach>' +
  '<dgm:forEach name="nodeForEach" axis="self" ptType="node">' +
  '<dgm:layoutNode name="levelNRoot"><dgm:alg type="hierRoot"/>' +
  `${SHAPE}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
  boxNode('level2Main', 'node2') +
  '<dgm:layoutNode name="levelNChildren"><dgm:alg type="hierChild"><dgm:param type="linDir" val="fromL"/></dgm:alg>' +
  `${SHAPE}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
  '<dgm:forEach name="repeatAgain" ref="repeat"/>' +
  '</dgm:layoutNode></dgm:layoutNode></dgm:forEach></dgm:forEach>' +
  '</dgm:layoutNode></dgm:layoutNode></dgm:forEach></dgm:layoutNode></dgm:layoutNode></dgm:layoutNode></dgm:layoutDef>';

/** A tree node with everything the data model needs, ids included. */
interface DeepModelNode extends DeepTreeNode {
  /** Content point id. */
  pt: string;
  /** Presentation point ids (`hierRoot` wrapper, box, `hierChild` row of its children). */
  pRoot: string;
  pChildren: string;
  /** `parOf` connection and its transition points (every non-doc parent link owns a pair). */
  parOf: string;
  parTrans: string;
  sibTrans: string;
  children: DeepModelNode[];
}

/** `<dgm:spPr/>`, or with an `a:solidFill` override when `fill` validates as hex. */
function spPrFor(fill: string | undefined): string {
  const validated = validateHexColor(fill, '');
  return validated ? `<dgm:spPr><a:solidFill><a:srgbClr val="${validated}"/></a:solidFill></dgm:spPr>` : '<dgm:spPr/>';
}

/**
 * Generate the five parts of a multi-level, top-down `tree` SmartArt. `flowchart` must already be
 * classified `tree` by {@link classifyTopology}; the generated model carries every edge label folded
 * into the destination node's text (`label : node`, as `tree.ts` does).
 */
export function generateDeepTree(flowchart: Flowchart, options: SmartArtGenerateOptions = {}): SmartArtTreeOutput & { frame: { cx: number; cy: number } } {
  const style: SmartArtStyle = options.style ?? 'simple';
  const hasIncoming = new Set(flowchart.edges.map((e) => e.to));
  const rootNode = flowchart.nodes.find((n) => !hasIncoming.has(n.id));
  if (!rootNode) throw new Error('generateDeepTree: no node with in-degree 0 -- flowchart is not a valid tree');
  const byId = new Map(flowchart.nodes.map((n) => [n.id, n]));
  const incomingLabel = new Map<string, string>();
  for (const edge of flowchart.edges) if (edge.label) incomingLabel.set(edge.to, edge.label);

  // Model ids are plain unsigned integers (ST_ModelId, ECMA-376 §21.4) allocated in one counter.
  let next = 0;
  const newId = (): string => String(next++);
  const docId = newId();

  const seen = new Set<string>();
  const build = (n: FlowNode): DeepModelNode => {
    seen.add(n.id);
    const label = incomingLabel.get(n.id);
    const childNodes = flowchart.edges
      .filter((e) => e.from === n.id)
      .map((e) => byId.get(e.to))
      .filter((c): c is FlowNode => c !== undefined && !seen.has(c.id));
    const pt = newId();
    const model: DeepModelNode = {
      id: '', // box presentation point, assigned in the second pass
      text: label ? `${label} : ${n.label}` : n.label,
      ...(n.fill ? { fill: n.fill } : {}),
      pt,
      pRoot: '',
      pChildren: '',
      parOf: '',
      parTrans: '',
      sibTrans: '',
      children: childNodes.map(build),
    };
    return model;
  };
  const root = build(rootNode);

  // Second pass (depth-first, same order as the drawing): presentation and transition ids.
  const preorder: DeepModelNode[] = [];
  const visit = (n: DeepModelNode): void => {
    preorder.push(n);
    n.children.forEach(visit);
  };
  visit(root);
  const pDocComposite = newId();
  const pDocFlow = newId();
  const pDocTop = newId();
  for (const n of preorder) {
    n.parOf = newId();
    n.parTrans = newId();
    n.sibTrans = newId();
    n.pRoot = newId();
    n.id = newId();
    n.pChildren = newId();
    if (n !== root) n.connId = newId();
  }
  const nonRootCount = preorder.length - 1;

  const contentPts = preorder
    .map(
      (n) =>
        `<dgm:pt modelId="${n.pt}"><dgm:prSet phldrT="[Texte]"/>${spPrFor(n.fill)}` +
        `<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>${escapeXml(n.text)}</a:t></a:r></a:p></dgm:t></dgm:pt>` +
        `<dgm:pt modelId="${n.parTrans}" type="parTrans" cxnId="${n.parOf}"><dgm:prSet/><dgm:spPr/></dgm:pt>` +
        `<dgm:pt modelId="${n.sibTrans}" type="sibTrans" cxnId="${n.parOf}"><dgm:prSet/><dgm:spPr/></dgm:pt>`
    )
    .join('');

  let styleIdx = 0;
  const presPts =
    `<dgm:pt modelId="${pDocComposite}" type="pres"><dgm:prSet presAssocID="${docId}" presName="treeComposite" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="${pDocFlow}" type="pres"><dgm:prSet presAssocID="${docId}" presName="treeFlow" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    `<dgm:pt modelId="${pDocTop}" type="pres"><dgm:prSet presAssocID="${docId}" presName="treeTop" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
    preorder
      .map((n) => {
        const isRoot = n === root;
        const idx = isRoot ? 0 : styleIdx++;
        const conn = isRoot
          ? ''
          : `<dgm:pt modelId="${n.connId}" type="pres"><dgm:prSet presAssocID="${n.parTrans}" presName="levelNConn" presStyleLbl="parChTrans1D2" presStyleIdx="${idx}" presStyleCnt="${nonRootCount}"/><dgm:spPr/></dgm:pt>`;
        return (
          conn +
          `<dgm:pt modelId="${n.pRoot}" type="pres"><dgm:prSet presAssocID="${n.pt}" presName="${isRoot ? 'level1Root' : 'levelNRoot'}" presStyleCnt="0"/><dgm:spPr/></dgm:pt>` +
          `<dgm:pt modelId="${n.id}" type="pres"><dgm:prSet presAssocID="${n.pt}" presName="${isRoot ? 'level1Main' : 'level2Main'}" presStyleLbl="${isRoot ? 'node1' : 'node2'}" presStyleIdx="${idx}" presStyleCnt="${isRoot ? 1 : nonRootCount}"/><dgm:spPr/></dgm:pt>` +
          `<dgm:pt modelId="${n.pChildren}" type="pres"><dgm:prSet presAssocID="${n.pt}" presName="${isRoot ? 'level1Children' : 'levelNChildren'}" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`
        );
      })
      .join('');

  // doc -> root, then parent -> child; `srcOrd` is the child's position among its siblings.
  const parOfCxns = [`<dgm:cxn modelId="${root.parOf}" type="parOf" srcId="${docId}" destId="${root.pt}" srcOrd="0" destOrd="0" parTransId="${root.parTrans}" sibTransId="${root.sibTrans}"/>`];
  for (const n of preorder)
    n.children.forEach((c, i) =>
      parOfCxns.push(
        `<dgm:cxn modelId="${c.parOf}" type="parOf" srcId="${n.pt}" destId="${c.pt}" srcOrd="${i}" destOrd="0" parTransId="${c.parTrans}" sibTransId="${c.sibTrans}"/>`
      )
    );

  const cxn = (type: 'presOf' | 'presParOf', src: string, dest: string, srcOrd: number): string =>
    `<dgm:cxn modelId="${newId()}" type="${type}" srcId="${src}" destId="${dest}" srcOrd="${srcOrd}" destOrd="0" presId="${TREE_DEEP_LAYOUT_URN}"/>`;
  const presOfCxns = [cxn('presOf', docId, pDocComposite, 0)];
  const presParOfCxns = [cxn('presParOf', pDocComposite, pDocFlow, 0), cxn('presParOf', pDocFlow, pDocTop, 0), cxn('presParOf', pDocTop, root.pRoot, 0)];
  for (const n of preorder) {
    presOfCxns.push(cxn('presOf', n.pt, n.id, 0));
    if (n !== root) presOfCxns.push(cxn('presOf', n.parTrans, n.connId as string, 0));
    presParOfCxns.push(cxn('presParOf', n.pRoot, n.id, 0), cxn('presParOf', n.pRoot, n.pChildren, 1));
    // Under a `hierChild` row each child contributes its connector (even srcOrd) then its `hierRoot` (odd).
    n.children.forEach((c, i) => {
      presParOfCxns.push(cxn('presParOf', n.pChildren, c.connId as string, 2 * i), cxn('presParOf', n.pChildren, c.pRoot, 2 * i + 1));
    });
  }

  const withDrawing = options.drawing === true;
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}">` +
    `<dgm:ptLst><dgm:pt modelId="${docId}" type="doc"><dgm:prSet loTypeId="${TREE_DEEP_LAYOUT_URN}" loCatId="hierarchy" ` +
    'qsTypeId="urn:md2nativedocx/smartart-quickstyle/tree1" qsCatId="simple" ' +
    'csTypeId="urn:md2nativedocx/smartart-colors/tree1" csCatId="accent1"/></dgm:pt>' +
    contentPts +
    presPts +
    `</dgm:ptLst><dgm:cxnLst>${parOfCxns.join('')}${presOfCxns.join('')}${presParOfCxns.join('')}</dgm:cxnLst>` +
    `<dgm:bg/><dgm:whole/>${withDrawing ? DRAWING_EXT_LST_XML : ''}</dgm:dataModel>`;

  const { shapes, frame } = deepTreeShapes(root, style);
  return {
    dataXml: xml,
    layoutXml: TREE_DEEP_LAYOUT_XML,
    colorsXml:
      style === 'simple'
        ? TREE_COLORS_XML
        : buildColorsXml(style, 'urn:md2nativedocx/smartart-colors/tree1', ['node1', 'node2', 'parChTrans1D2']),
    styleXml:
      style === 'simple'
        ? TREE_STYLE_XML
        : buildStyleXml(style, 'urn:md2nativedocx/smartart-quickstyle/tree1', ['node1', 'node2', 'parChTrans1D2']),
    ...(withDrawing ? { drawingXml: buildDiagramDrawingXml(shapes, style) } : {}),
    frame,
  };
}
