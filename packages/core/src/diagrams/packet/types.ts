/**
 * Intermediate AST for a Mermaid `packet` diagram (grammar verified against
 * `mermaid-js/mermaid`'s `docs/syntax/packet.md`, 2026-10-02).
 */

/** One field, over the inclusive bit range [start, end] (lowest bit first). */
export interface PacketField {
  start: number;
  end: number;
  label: string;
}

export interface PacketDiagram {
  title?: string;
  fields: PacketField[];
}
