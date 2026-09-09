/**
 * Parser for Mermaid `requirementDiagram` (grammar verified against
 * mermaid.js.org/syntax/requirementDiagram.html, fetched 2026-09-09).
 * Line-oriented, same forgiving convention as `../../parser/parser.ts` and
 * `../class-diagram/parser.ts`.
 *
 * V1 scope, deliberately:
 * - Requirement blocks (`<type> name { id: ... text: ... risk: ...
 *   verifymethod: ... }`) and element blocks (`element name { type: ...
 *   docref: ... }`).
 * - Both relationship line directions (`A - type -> B` and
 *   `A <- type - B`), all 7 relationship type keywords.
 *
 * `Requirement.type`/`risk`/`verifyMethod` are kept as free-form strings
 * rather than validated against the spec's own enumerated keyword lists
 * (`REQUIREMENT_TYPES`, `Low|Medium|High`, `Analysis|Inspection|Test|
 * Demonstration`) — this project has no evidence those lists are exhaustive
 * across Mermaid versions, and rejecting/warning on an unrecognized-but-
 * plausible value would risk losing real content over a list this parser
 * can't be sure is complete. Only relationship type keywords are validated
 * (a fixed, closed set — an unrecognized one can't be routed to any of the
 * 7 rendering styles), degrading to the generic "unsupported line" warning.
 */

import type { RequirementDiagram, RequirementElement, RequirementRelationType, Requirement } from './types.js';

export interface RequirementDiagramParseResult {
  ast: RequirementDiagram;
  warnings: string[];
}

const RELATIONSHIP_TYPES = new Set<RequirementRelationType>([
  'contains',
  'copies',
  'derives',
  'satisfies',
  'verifies',
  'refines',
  'traces',
]);

function isRelationshipType(word: string): word is RequirementRelationType {
  return RELATIONSHIP_TYPES.has(word as RequirementRelationType);
}

/**
 * Parse one relationship line in either documented direction:
 * `source - type -> destination` or `destination <- type - source`. Split
 * on the literal `->`/`<-` arrow tokens (and, for the type word, the
 * literal `-` separator) rather than one combined regex — the same
 * detect-unsafe-regex false positive already documented at `../quadrant/
 * parser.ts`'s POINT_TAIL and `../er-diagram/parser.ts`'s relationship
 * parsing.
 */
function parseRelationshipLine(line: string): { from: string; to: string; type: RequirementRelationType } | null {
  const rightArrowIdx = line.indexOf('->');
  if (rightArrowIdx !== -1) {
    const to = line.slice(rightArrowIdx + 2).trim();
    const left = line.slice(0, rightArrowIdx).trim();
    const dashIdx = left.lastIndexOf('-');
    if (dashIdx === -1) return null;
    const from = left.slice(0, dashIdx).trim();
    const type = left.slice(dashIdx + 1).trim();
    if (from.length > 0 && to.length > 0 && isRelationshipType(type)) return { from, to, type };
    return null;
  }
  const leftArrowIdx = line.indexOf('<-');
  if (leftArrowIdx !== -1) {
    const to = line.slice(0, leftArrowIdx).trim();
    const right = line.slice(leftArrowIdx + 2).trim();
    const dashIdx = right.lastIndexOf('-');
    if (dashIdx === -1) return null;
    const type = right.slice(0, dashIdx).trim();
    const from = right.slice(dashIdx + 1).trim();
    if (from.length > 0 && to.length > 0 && isRelationshipType(type)) return { from, to, type };
    return null;
  }
  return null;
}

export function parseRequirementDiagram(text: string): RequirementDiagramParseResult {
  const warnings: string[] = [];
  const requirements = new Map<string, Requirement>();
  const elements = new Map<string, RequirementElement>();
  const relationships: RequirementDiagram['relationships'] = [];

  type Block = { kind: 'requirement'; req: Requirement } | { kind: 'element'; el: RequirementElement };
  let open: Block | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^requirementDiagram\b/i.test(line)) continue;

    if (open) {
      if (line === '}') {
        open = null;
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        warnings.push(`Unsupported field line ignored: ${line}`);
        continue;
      }
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      if (open.kind === 'requirement') {
        if (key === 'id') open.req.id = value;
        else if (key === 'text') open.req.text = value;
        else if (key === 'risk') open.req.risk = value;
        else if (key === 'verifymethod') open.req.verifyMethod = value;
        else warnings.push(`Unsupported requirement field ignored: ${line}`);
      } else {
        if (key === 'type') open.el.type = value;
        else if (key === 'docref') open.el.docRef = value;
        else warnings.push(`Unsupported element field ignored: ${line}`);
      }
      continue;
    }

    if (line.endsWith('{')) {
      const header = line.slice(0, -1).trim().split(/\s+/).filter(Boolean);
      if (header.length === 2 && header[0] === 'element') {
        const el: RequirementElement = { name: header[1]! };
        elements.set(el.name, el);
        open = { kind: 'element', el };
        continue;
      }
      if (header.length === 2) {
        const req: Requirement = { name: header[1]!, type: header[0]! };
        requirements.set(req.name, req);
        open = { kind: 'requirement', req };
        continue;
      }
      warnings.push(`Unsupported block opener ignored: ${line}`);
      continue;
    }

    const rel = parseRelationshipLine(line);
    if (rel) {
      relationships.push(rel);
      continue;
    }

    if (/^(?:classDef|class|style)\b/i.test(line)) {
      warnings.push(`Styling directives are not yet supported for requirement diagrams, ignored: ${line}`);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (open) {
    warnings.push('One or more requirement/element blocks were not closed with a matching "}".');
  }

  return {
    ast: { requirements: [...requirements.values()], elements: [...elements.values()], relationships },
    warnings,
  };
}
