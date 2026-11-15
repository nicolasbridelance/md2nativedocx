import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRendering } from '../../src/rendering-plan.js';

// R3.4: `planRendering` runs on every keystroke in the VS Code extension. It must stay cheap on
// pathological input (no layout, no backtracking). The bound is ~10x the measured time, so it
// catches a regression to something super-linear without being flaky on a slow CI machine.
const BUDGET_MS = 3000;
const settings = { smartArt: true, nativeCharts: true };
const nodes = Array.from({ length: 40 }, (_, i) => `N${i}`);

const cases: Record<string, string> = {
  'one 100 KB line': 'flowchart TD\n' + 'A-->B;'.repeat(16000),
  'a 100 KB label': 'flowchart TD\nA["' + 'x'.repeat(100000) + '"]-->B',
  'brackets never closed': 'flowchart TD\nA' + '['.repeat(50000),
  'parentheses never closed': 'flowchart TD\nA' + '(('.repeat(50000),
  'escaped quotes never closed': 'flowchart TD\nA["' + '\\"'.repeat(50000),
  'complete graph K40': 'flowchart TD\n' + nodes.flatMap((a) => nodes.filter((b) => a !== b).map((b) => `${a}-->${b}`)).join('\n'),
  'long sequence diagram': 'sequenceDiagram\n' + 'A->>B: hi\n'.repeat(20000),
  'long gantt': 'gantt\n' + 'section s\n t :a, 2020-01-01, 1d\n'.repeat(20000),
  'long pie': 'pie\n' + '"a" : 1\n'.repeat(50000),
  'long xychart axis': 'xychart-beta\n x-axis [' + 'a,'.repeat(50000) + 'b]\n',
};

for (const [name, source] of Object.entries(cases)) {
  test(`planRendering stays within budget on ${name}`, () => {
    const start = performance.now();
    assert.doesNotThrow(() => planRendering(source, settings));
    const elapsed = performance.now() - start;
    assert.ok(elapsed < BUDGET_MS, `took ${Math.round(elapsed)} ms (budget ${BUDGET_MS} ms)`);
  });
}
