#!/usr/bin/env node
/**
 * Fetch every example diagram of Mermaid's official syntax pages, for one released version, into
 * `test-corpus/mermaid-official/` (TODO §2, "Conformité Mermaid", stage 1).
 *
 *   node scripts/fetch-mermaid-examples.mjs mermaid@12.3.0
 *
 * Reads `packages/mermaid/src/docs/syntax/*.md` at that tag on GitHub and keeps each fenced block whose
 * info string is `mermaid-example` or `mermaid` (the blocks the Mermaid site renders), in page order.
 * Writes `examples.json` ({ tag, commit, pages: { <page>: [source, ...] } }) and Mermaid's MIT `LICENSE`.
 * Run by hand when Mermaid publishes a version; the output is committed, the tests never touch the network.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2];
if (!tag || !/^mermaid@\d+\.\d+\.\d+$/.test(tag)) {
  console.error('Usage: node scripts/fetch-mermaid-examples.mjs mermaid@<x.y.z>');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'test-corpus', 'mermaid-official');
const api = 'https://api.github.com/repos/mermaid-js/mermaid';
const raw = `https://raw.githubusercontent.com/mermaid-js/mermaid/${encodeURIComponent(tag)}`;
const headers = { 'User-Agent': 'md2nativedocx-conformance', Accept: 'application/vnd.github+json' };

async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Fenced blocks rendered by the Mermaid site: info string `mermaid-example` or `mermaid`. */
export function extractExamples(markdown) {
  const examples = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*(mermaid-example|mermaid)\s*$/.exec(lines[i]);
    if (!open) continue;
    const fence = open[2];
    const body = [];
    for (i++; i < lines.length && !lines[i].trim().startsWith(fence); i++) body.push(lines[i]);
    examples.push(body.join('\n'));
  }
  return examples;
}

const commit = (await getJson(`${api}/commits/${encodeURIComponent(tag)}`)).sha;
const listing = await getJson(`${api}/contents/packages/mermaid/src/docs/syntax?ref=${encodeURIComponent(tag)}`);
const pages = {};
for (const entry of listing.filter((e) => e.type === 'file' && e.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
  const examples = extractExamples(await getText(`${raw}/packages/mermaid/src/docs/syntax/${entry.name}`));
  if (examples.length > 0) pages[entry.name.replace(/\.md$/, '')] = examples;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'examples.json'), `${JSON.stringify({ tag, commit, pages }, null, 1)}\n`);
writeFileSync(join(outDir, 'LICENSE'), await getText(`${raw}/LICENSE`));
const total = Object.values(pages).reduce((n, list) => n + list.length, 0);
console.log(`${tag} (${commit.slice(0, 7)}): ${total} examples from ${Object.keys(pages).length} pages -> ${outDir}`);
