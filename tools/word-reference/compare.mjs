#!/usr/bin/env node
/**
 * Extract and compare the `wpg:wgp` / `wps:wsp` fragment from a Word-generated
 * reference .docx with our translator output.
 *
 * Usage:
 *   node tools/word-reference/compare.mjs <reference.docx> [our.docx]
 *
 * If `our.docx` is omitted, the tool extracts the `wpg:wgp` fragment from the
 * reference document and pretty-prints it for manual comparison.
 *
 * The tool extracts `word/document.xml` from both .docx files (they are ZIPs),
 * isolates the `wpg:wgp` element, and prints a side-by-side comparison of the
 * element structure (names + attributes), ignoring whitespace and attribute
 * order, so structural differences are easy to spot.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node compare.mjs <reference.docx> [our.docx]');
  process.exit(1);
}

/** Extract word/document.xml from a .docx (ZIP) file. */
function extractDocumentXml(docxPath) {
  if (!existsSync(docxPath)) {
    throw new Error(`File not found: ${docxPath}`);
  }
  return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
    encoding: 'utf8',
  });
}

/** Extract the `wpg:wgp` fragment from document.xml. */
function extractWgp(xml) {
  const start = xml.indexOf('<wpg:wgp');
  if (start < 0) return null;
  const end = xml.indexOf('</wpg:wgp>', start) + '</wpg:wgp>'.length;
  return xml.slice(start, end);
}

/** Tokenize an XML fragment into a structural representation (element names +
 * attributes), ignoring whitespace and attribute order. */
function tokenize(xml) {
  const tokens = [];
  const re = /<(\/?)([A-Za-z0-9:_-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('<')) {
      const attrs = (m[3] ?? '').trim().split(/\s+/).filter(Boolean).sort().join(' ');
      tokens.push(`${m[1]}${m[2]}${attrs ? ` ${attrs}` : ''}${m[4]}`);
    } else {
      const text = m[5].trim();
      if (text.length > 0) tokens.push(`text:${text}`);
    }
  }
  return tokens;
}

/** Print a structural comparison of two token lists. */
function compare(nameA, tokensA, nameB, tokensB) {
  const max = Math.max(tokensA.length, tokensB.length);
  console.log(`\n=== Comparaison structurelle : ${nameA} vs ${nameB} ===\n`);
  let diffs = 0;
  for (let i = 0; i < max; i++) {
    const a = tokensA[i] ?? '(fin)';
    const b = tokensB[i] ?? '(fin)';
    const marker = a === b ? '  ' : '≠ ';
    if (a !== b) diffs++;
    console.log(`${marker}${String(i).padStart(4)}  ${a.padEnd(60)}  |  ${b}`);
  }
  console.log(`\n=== ${diffs} différence(s) structurelle(s) ===`);
  return diffs;
}

const referencePath = args[0];
const ourPath = args[1];

const referenceXml = extractDocumentXml(referencePath);
const referenceWgp = extractWgp(referenceXml);
if (!referenceWgp) {
  console.error('Aucun wpg:wgp trouvé dans le document de référence.');
  process.exit(1);
}

if (!ourPath) {
  console.log('=== Fragment wpg:wgp du document de référence ===\n');
  console.log(referenceWgp);
  process.exit(0);
}

const ourXml = extractDocumentXml(ourPath);
const ourWgp = extractWgp(ourXml);
if (!ourWgp) {
  console.error('Aucun wpg:wgp trouvé dans notre document.');
  process.exit(1);
}

const referenceTokens = tokenize(referenceWgp);
const ourTokens = tokenize(ourWgp);
const diffs = compare(basename(referencePath), referenceTokens, basename(ourPath), ourTokens);
process.exit(diffs === 0 ? 0 : 1);
