/**
 * Intermediate AST for a Mermaid `wardley-beta` map (grammar checked against
 * `mermaid-js/mermaid`'s `docs/syntax/wardley.md` and against the real
 * `@mermaid-js/parser` 11.17.2). All coordinates are normalized to 0-100
 * percent: `x` = evolution (left to right), `y` = visibility (bottom to top).
 */

export type WardleyStrategy = 'build' | 'buy' | 'outsource' | 'market';
export type WardleyFlow = 'forward' | 'backward' | 'bidirectional';
export type WardleyNodeKind = 'anchor' | 'component' | 'pipeline-component';

export interface WardleyNode {
  /** Unique name (pipeline components are keyed `Parent_Child` internally by Mermaid; here the plain label). */
  name: string;
  kind: WardleyNodeKind;
  x: number;
  y: number;
  /** Label offset in px from its default position. */
  labelDx?: number;
  labelDy?: number;
  inertia?: boolean;
  strategy?: WardleyStrategy;
}

export interface WardleyLink {
  source: string;
  target: string;
  dashed: boolean;
  label?: string;
  flow?: WardleyFlow;
}

export interface WardleyPipeline {
  /** Name of the parent component. */
  parent: string;
  /** Names of its pipeline components. */
  components: string[];
}

export interface WardleyPositioned {
  text: string;
  x: number;
  y: number;
}

export interface WardleyAnnotation {
  number: number;
  x: number;
  y: number;
  text?: string;
}

export interface WardleyStage {
  name: string;
  /** Right boundary, 0-100. */
  boundary?: number;
}

export interface WardleyMap {
  title?: string;
  size?: { width: number; height: number };
  nodes: WardleyNode[];
  links: WardleyLink[];
  pipelines: WardleyPipeline[];
  /** Evolve arrows: component name -> target x (0-100). */
  evolves: Array<{ name: string; target: number }>;
  notes: WardleyPositioned[];
  annotations: WardleyAnnotation[];
  annotationsBox?: { x: number; y: number };
  accelerators: WardleyPositioned[];
  deaccelerators: WardleyPositioned[];
  stages: WardleyStage[];
}
