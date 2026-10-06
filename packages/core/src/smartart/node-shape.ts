/**
 * A Mermaid node's own shape (diamond, circle, cylinder…) on its SmartArt box, written the way Word writes
 * right-click > Change Shape: an `a:prstGeom` in the `dgm:spPr` of the box's **presentation** point (structure
 * read from a Word-authored sample, `handmade_samples/processus_shape.docx`, never its content). Word keeps such
 * an override when it lays the diagram out again, and Format > Reset Shape removes it. The cached drawing draws
 * the same preset (`drawing.ts`'s `geom`).
 *
 * Plain boxes (`rect`, `roundRect`, `stadium`) get no override and keep the layout's own shape, so the
 * SmartArt styles keep applying to them as before. The preset comes from the shape translator's own table
 * (`PRST_BY_SHAPE`), never from user text. Mirrored variants (`[\Text\]`…) keep the unmirrored preset.
 */

import type { FlowNode } from '../types.js';
import { PRST_BY_SHAPE } from '../translator/ooxml-translator.js';

const LAYOUT_SHAPES = new Set<FlowNode['shape']>(['rect', 'roundRect', 'stadium']);

/** The preset to draw `node`'s box with, or `undefined` to keep the layout's shape. */
export function nodeGeom(node: FlowNode): string | undefined {
  return LAYOUT_SHAPES.has(node.shape) ? undefined : PRST_BY_SHAPE[node.shape];
}

/** The `dgm:spPr` of a box's presentation point: empty, or the shape override. */
export function presSpPrXml(geom: string | undefined): string {
  return geom ? `<dgm:spPr><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom></dgm:spPr>` : '<dgm:spPr/>';
}
