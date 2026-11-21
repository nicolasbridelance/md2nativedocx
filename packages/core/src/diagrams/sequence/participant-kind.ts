/**
 * The participant symbols the three sequence syntaxes name the same way: Mermaid's `@{ "type": "database" }`,
 * PlantUML's `database X`, ZenUML's `@Database X`. One table, so the three parsers agree on what is drawn.
 */

import type { SequenceParticipantKind } from './types.js';

const KINDS: ReadonlyMap<string, SequenceParticipantKind> = new Map([
  ['boundary', 'boundary'],
  ['control', 'control'],
  ['entity', 'entity'],
  ['database', 'database'],
  ['collections', 'collections'],
  // ZenUML spells it in the singular (`@Collection`).
  ['collection', 'collections'],
  ['queue', 'queue'],
]);

/** The symbol a type word names (any case), or `undefined` for `participant`, `actor` and unknown words. */
export function participantKind(word: string): SequenceParticipantKind | undefined {
  return KINDS.get(word.toLowerCase());
}
