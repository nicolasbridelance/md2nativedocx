#!/usr/bin/env node
/**
 * Stage 1 of the Mermaid conformance work (TODO §2, "Conformité Mermaid"): run every official example in
 * `test-corpus/mermaid-official/examples.json` through `renderDiagram()` and classify the result.
 *
 *   npm run build -w packages/core && node scripts/mermaid-conformance.mjs [--report] [--page <name>] [--verbose]
 *
 * Per example, one status:
 *   - `clean`      : the type expected for the page was detected and rendered with no warning (rendering
 *                    notices such as "Native shapes used" are not syntax gaps and do not count);
 *   - `warned`     : rendered, with warnings (syntax ignored, SmartArt/chart refused, a note…);
 *   - `not-converted`: a Mermaid type this project recognizes but does not draw yet (a note stands in);
 *   - `wrong-type` : detected as another type than the page documents (e.g. an unknown type drawn as a flowchart);
 *   - `threw`      : renderDiagram threw.
 * `--write-baseline` rewrites `expected-clean.json`, the list the unit test locks.
 * `--report` rewrites `test-corpus/mermaid-official/REPORT.md`. Exit code 0 always: this measures, the
 * locked expectations live in `packages/core/test/unit/mermaid-official.test.ts`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { renderDiagram } = await import(new URL('../packages/core/dist/index.js', import.meta.url));

/** The diagram type each Mermaid syntax page documents; `null` = a type this project does not know. */
export const PAGE_TYPES = {
  agentflow: 'agentflow',
  architecture: 'architecture',
  block: 'block',
  c4: 'c4',
  classDiagram: 'class',
  cynefin: 'cynefin',
  entityRelationshipDiagram: 'er',
  eventmodeling: 'eventModeling',
  flowchart: 'flowchart',
  gantt: 'gantt',
  gitgraph: 'gitGraph',
  ishikawa: 'ishikawa',
  kanban: 'kanban',
  mindmap: 'mindmap',
  packet: 'packet',
  pie: 'pie',
  quadrantChart: 'quadrant',
  radar: 'radar',
  railroad: 'railroad',
  requirementDiagram: 'requirement',
  sankey: 'sankey',
  sequenceDiagram: 'sequence',
  stateDiagram: 'state',
  swimlanes: 'flowchart', // `swimlane-beta` is a flowchart header alias
  timeline: 'timeline',
  treeView: 'treeView',
  treemap: 'treemap',
  usecase: 'usecase',
  userJourney: 'journey',
  venn: 'venn',
  wardley: 'wardley',
  xyChart: 'xychart',
  zenuml: 'zenuml',
};

/**
 * Rendering notices, not syntax gaps: the source was understood, the renderer only reports a choice it
 * made (shapes instead of SmartArt, a diagram scaled down to fit the page).
 */
const NOTICES = [/^Native shapes used \(/, /^Actor icons and /, /^diagram scaled down to fit the page/, /^Frontmatter options \(theme, colours, layout\) are not applied/, /^Interactive directives \(`click`, `link`, `callback`\) are not exported/];
export const isNotice = (warning) => NOTICES.some((re) => re.test(warning));

export function classify(page, source) {
  const expected = PAGE_TYPES[page];
  try {
    const result = renderDiagram(source, { smartArt: true, nativeCharts: true, newPartId: () => '00000000-0000-4000-8000-000000000000' });
    const { diagramType } = result.metadata;
    const warnings = result.metadata.warnings.filter((w) => !isNotice(w));
    if (expected === null && diagramType === 'mermaidUnsupported') return { status: 'not-converted', detected: diagramType, warnings };
    if (expected === null || (expected !== undefined && diagramType !== expected)) {
      return { status: 'wrong-type', detected: diagramType, warnings };
    }
    return { status: warnings.length === 0 ? 'clean' : 'warned', detected: diagramType, kind: result.kind, warnings };
  } catch (err) {
    return { status: 'threw', error: `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}` };
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const only = args.includes('--page') ? args[args.indexOf('--page') + 1] : undefined;
  const verbose = args.includes('--verbose');
  const data = JSON.parse(readFileSync(join(root, 'test-corpus', 'mermaid-official', 'examples.json'), 'utf8'));
  const rows = [];
  const totals = { clean: 0, warned: 0, 'not-converted': 0, 'wrong-type': 0, threw: 0 };
  for (const [page, examples] of Object.entries(data.pages)) {
    if (only && page !== only) continue;
    const counts = { clean: 0, warned: 0, 'not-converted': 0, 'wrong-type': 0, threw: 0 };
    const details = [];
    examples.forEach((source, i) => {
      const r = classify(page, source);
      counts[r.status]++;
      totals[r.status]++;
      if (r.status !== 'clean') {
        const why = r.error ?? (r.status === 'wrong-type' ? `detected ${r.detected}` : r.warnings.join(' | '));
        details.push(`#${i} ${r.status}: ${why}`);
      }
    });
    rows.push({ page, n: examples.length, ...counts, details });
  }
  const pct = (n, d) => (d === 0 ? '-' : `${Math.round((100 * n) / d)} %`);
  const all = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`${data.tag}: ${all} examples — clean ${totals.clean} (${pct(totals.clean, all)}), warned ${totals.warned}, not converted ${totals['not-converted']}, wrong-type ${totals['wrong-type']}, threw ${totals.threw}`);
  for (const r of rows) {
    console.log(`${r.page.padEnd(26)} ${String(r.n).padStart(4)}  clean ${String(r.clean).padStart(3)}  warned ${String(r.warned).padStart(3)}  notconv ${String(r['not-converted']).padStart(3)}  wrong ${String(r['wrong-type']).padStart(3)}  threw ${String(r.threw).padStart(3)}`);
    if (verbose) for (const d of r.details) console.log(`    ${d.slice(0, 300)}`);
  }
  if (args.includes('--write-baseline')) {
    // The examples locked as clean by packages/core/test/unit/mermaid-official.test.ts: raise it after a fix.
    const clean = [];
    for (const [page, examples] of Object.entries(data.pages)) examples.forEach((source, i) => classify(page, source).status === 'clean' && clean.push(`${page}#${i}`));
    writeFileSync(join(root, 'test-corpus', 'mermaid-official', 'expected-clean.json'), `${JSON.stringify({ tag: data.tag, clean }, null, 1)}
`);
    console.log(`baseline: ${clean.length} clean examples locked`);
  }
  if (args.includes('--report')) {
    const lines = [
      '# Conformité aux exemples officiels de Mermaid (étage 1)',
      '',
      `Généré par \`node scripts/mermaid-conformance.mjs --report\` sur \`${data.tag}\` (commit \`${data.commit.slice(0, 7)}\`) :`,
      'chaque bloc d\'exemple des pages de syntaxe de la doc Mermaid passé dans `renderDiagram()`.',
      'Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).',
      '',
      `**Total : ${all} exemples — ${totals.clean} sans avertissement (${pct(totals.clean, all)}), ${totals.warned} avec avertissement, ${totals['not-converted']} de types pas encore dessinés (note à la place), ${totals['wrong-type']} mal typés, ${totals.threw} en échec.**`,
      '',
      '| Page | Exemples | Sans avert. | Avec avert. | Type non dessiné | Mal typés | Échecs |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...rows.map((r) => `| ${r.page} | ${r.n} | ${r.clean} | ${r.warned} | ${r['not-converted']} | ${r['wrong-type']} | ${r.threw} |`),
      '',
      '## Détail des écarts',
      '',
      ...rows.flatMap((r) => (r.details.length === 0 ? [] : [`### ${r.page}`, '', ...r.details.map((d) => `- ${d.replace(/\|/g, '\\|').slice(0, 400)}`), ''])),
    ];
    writeFileSync(join(root, 'test-corpus', 'mermaid-official', 'REPORT.md'), `${lines.join('\n')}\n`);
  }
}
