/**
 * Intermediate AST for a Mermaid `kanban` board (grammar verified against
 * `mermaid-js/mermaid`'s `docs/syntax/kanban.md`, 2026-10-02).
 */

export type KanbanPriority = 'Very High' | 'High' | 'Low' | 'Very Low';

export interface KanbanCard {
  id: string;
  title: string;
  /** `ticket` metadata, shown as plain text (never turned into a hyperlink). */
  ticket?: string;
  assigned?: string;
  priority?: KanbanPriority;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
}
