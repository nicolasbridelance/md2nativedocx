/**
 * Intermediate AST for a Mermaid C4 diagram (`C4Context`/`C4Container`/
 * `C4Component`/`C4Dynamic`/`C4Deployment`). The grammar is a PlantUML-
 * compatible function-call syntax (`Type(alias, "label", ...)`), marked
 * "experimental" by Mermaid's own docs; this AST follows what Mermaid 12.3
 * itself reads and draws (its parser and its C4 renderer, read against the
 * official examples of `test-corpus/mermaid-official/`).
 *
 * - Every element type (`Person(_Ext)`, `System(Db/Queue)(_Ext)`,
 *   `Container(Db/Queue)(_Ext)`, `Component(Db/Queue)(_Ext)`) is one
 *   `C4Element`: a `category`, an `external` flag and an optional `variant`
 *   (db/queue), the only axes Mermaid's naming scheme varies.
 * - `Boundary`/`Enterprise_Boundary`/`System_Boundary`/`Container_Boundary`
 *   and `Deployment_Node`/`Node`/`Node_L`/`Node_R` are `C4Boundary` frames:
 *   Mermaid draws a deployment node as a frame around what it holds, never as
 *   a box of its own. Nesting is `parent` on elements and frames.
 * - Every `Rel*` variant is one `C4Relationship`. The `_U`/`_D`/`_L`/`_R`
 *   suffixes are manual-layout hints that Mermaid's own renderer ignores too;
 *   `RelIndex`'s leading index is dropped, as in Mermaid.
 * - `UpdateElementStyle` (on an element or a frame), `UpdateRelStyle` and
 *   `UpdateLayoutConfig` are applied: `style` on the element, frame or
 *   relationship they name, `layout` on the diagram.
 */

export type C4Category = 'person' | 'system' | 'container' | 'component';
export type C4Variant = 'db' | 'queue';

/** Which of the five C4 headers opened the diagram. Only `dynamic` changes
 * the drawing: its relationships are numbered in statement order, as in Mermaid. */
export type C4Level = 'context' | 'container' | 'component' | 'dynamic' | 'deployment';

/** Colours set by `UpdateElementStyle`, as bare 6-digit uppercase hex (validated by the parser). */
export interface C4ElementStyle {
  /** `$bgColor`: the fill. */
  fill?: string;
  /** `$borderColor`: the outline. */
  line?: string;
  /** `$fontColor`: the text. */
  text?: string;
}

/** What `UpdateRelStyle` sets on a relationship. */
export interface C4RelationshipStyle {
  /** `$lineColor`, bare 6-digit uppercase hex. */
  line?: string;
  /** `$textColor`, bare 6-digit uppercase hex. */
  text?: string;
  /** `$offsetX` / `$offsetY`: shift of the label from the middle of the line, in px (whole numbers, as Mermaid reads them). */
  offsetX?: number;
  offsetY?: number;
}

export interface C4Element {
  id: string;
  category: C4Category;
  external: boolean;
  variant?: C4Variant;
  label: string;
  /** The `?techn` positional argument of a Container/Component. */
  techn?: string;
  description?: string;
  /** The id of the enclosing {@link C4Boundary}, if any. */
  parent?: string;
  style?: C4ElementStyle;
}

/** A frame drawn around the elements and frames declared inside its `{ ... }`. */
export interface C4Boundary {
  id: string;
  label: string;
  /**
   * `boundary` for the four `*Boundary` calls (dashed outline), `deployment` for
   * `Deployment_Node`/`Node`/`Node_L`/`Node_R` (solid outline), as Mermaid draws them.
   */
  kind: 'boundary' | 'deployment';
  /**
   * The line shown as `[type]` under the label: `ENTERPRISE`, `SYSTEM` or `CONTAINER` for the
   * dedicated calls, the third argument of `Boundary(...)` (default `system`), a deployment node's
   * `?type` (default `node`).
   */
  type: string;
  /** A deployment node's `?descr`. */
  description?: string;
  /** The id of the enclosing frame, if any. */
  parent?: string;
  style?: C4ElementStyle;
}

export interface C4Relationship {
  from: string;
  to: string;
  label: string;
  techn?: string;
  bidirectional: boolean;
  style?: C4RelationshipStyle;
}

/** `UpdateLayoutConfig`: how many elements, and how many frames, sit side by side before a new row starts. */
export interface C4LayoutConfig {
  /** `$c4ShapeInRow` (Mermaid's default: 4). */
  shapesPerRow?: number;
  /** `$c4BoundaryInRow` (Mermaid's default: 2). */
  boundariesPerRow?: number;
}

export interface C4Diagram {
  title?: string;
  /** The header keyword; absent on an AST built by hand (drawn as `context`). */
  level?: C4Level;
  /** Elements in declaration order, which is the order Mermaid lays them out in. */
  elements: C4Element[];
  /** Frames in declaration order; absent or empty when the diagram has none. */
  boundaries?: C4Boundary[];
  relationships: C4Relationship[];
  layout?: C4LayoutConfig;
}
