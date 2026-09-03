#!/usr/bin/env node
// Reads the JUnit/LCOV reports produced by `npm run test:ci` (see each package's
// package.json) and prints a dated Markdown summary for $GITHUB_STEP_SUMMARY — so anyone
// looking at a CI run sees real numbers for that exact commit, not a hand-typed snapshot.
import { readFileSync, existsSync } from 'node:fs';

const packages = ['core', 'cli', 'pandoc-filter', 'vscode-extension'];

function parseJunitSummary(path) {
  const xml = readFileSync(path, 'utf8');
  const field = (name) => {
    const m = xml.match(new RegExp(`<!-- ${name} (\\S+) -->`));
    return m ? m[1] : '?';
  };
  return {
    tests: field('tests'),
    pass: field('pass'),
    fail: field('fail'),
    duration_ms: field('duration_ms'),
  };
}

function parseLcovTotals(path) {
  const lcov = readFileSync(path, 'utf8');
  let linesHit = 0;
  let linesFound = 0;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('LH:')) linesHit += Number(line.slice(3));
    else if (line.startsWith('LF:')) linesFound += Number(line.slice(3));
  }
  return linesFound === 0 ? null : ((linesHit / linesFound) * 100).toFixed(1);
}

const rows = [];
let totalTests = 0;
let totalFail = 0;

for (const pkg of packages) {
  const junitPath = `packages/${pkg}/reports/junit.xml`;
  if (!existsSync(junitPath)) {
    rows.push(`| \`${pkg}\` | — | pas de rapport (\`${junitPath}\` absent) |`);
    continue;
  }
  const s = parseJunitSummary(junitPath);
  totalTests += Number(s.tests) || 0;
  totalFail += Number(s.fail) || 0;
  const lcovPath = `packages/${pkg}/reports/lcov.info`;
  const coverage = existsSync(lcovPath) ? `, couverture lignes **${parseLcovTotals(lcovPath)}%**` : '';
  const status = Number(s.fail) === 0 ? '✅' : '❌';
  rows.push(`| \`${pkg}\` | ${status} ${s.pass}/${s.tests} (${s.duration_ms} ms)${coverage} |`);
}

const sha = process.env.GITHUB_SHA ?? 'local';
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

console.log(`## Test report — ${new Date().toISOString()}`);
console.log('');
console.log(`Commit \`${sha.slice(0, 12)}\`${runUrl ? ` — [voir ce run](${runUrl})` : ''}`);
console.log('');
console.log('| Package | Résultat |');
console.log('|---|---|');
console.log(rows.join('\n'));
console.log('');
console.log(
  totalFail === 0
    ? `**${totalTests} tests, 0 échec.**`
    : `**${totalTests} tests, ${totalFail} échec(s) — voir le détail ci-dessus.**`,
);
