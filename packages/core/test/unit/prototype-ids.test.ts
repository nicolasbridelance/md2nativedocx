import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram } from '../../src/render-diagram.js';

// Ids that name built-in object properties. Dagre and graphlib keep nodes in plain objects: `constructor` or
// `valueOf` crashed the layout with a raw TypeError, `__proto__` came out with NaN coordinates (found by the
// PlantUML class fuzz test, 2026-11-19). Ids are untrusted text, so every graph-based type must survive them.
const HOSTILE = ['constructor', 'valueOf', '__proto__', 'toString', 'hasOwnProperty'];

const sources: Record<string, (a: string, b: string) => string> = {
  class: (a, b) => `classDiagram\n${a} <|-- ${b}`,
  plantumlClass: (a, b) => `@startuml\n${a} *-- ${b}\n@enduml`,
  er: (a, b) => `erDiagram\n${a} ||--o{ ${b} : has`,
  state: (a, b) => `stateDiagram-v2\n${a} --> ${b}\n${b} --> ${a}`,
  requirement: (a, b) => `requirementDiagram\nrequirement ${a} {\nid: 1\n}\nelement ${b} {\ntype: x\n}\n${b} - satisfies -> ${a}`,
  c4: (a, b) => `C4Context\nPerson(${a}, "A")\nSystem(${b}, "B")\nRel(${a}, ${b}, "uses")`,
  architecture: (a, b) => `architecture-beta\nservice ${a}(server)[A]\nservice ${b}(db)[B]\n${a}:R -- L:${b}`,
  flowchart: (a, b) => `flowchart TD\nsubgraph ${a}\n${b} --> x\nend`,
};

for (const [type, make] of Object.entries(sources)) {
  test(`${type}: ids named like built-in properties are laid out like any other`, () => {
    for (let i = 0; i < HOSTILE.length; i++) {
      const a = HOSTILE[i] as string;
      const b = HOSTILE[(i + 1) % HOSTILE.length] as string;
      const { fragment } = renderDiagram(make(a, b));
      assert.doesNotMatch(fragment, /NaN|undefined/, `${a} / ${b}`);
    }
  });
}
