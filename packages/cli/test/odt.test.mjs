import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { ODF_GRAPHIC_DEFINITIONS } from '@md2nativedocx/core';
import { ConversionError, convert } from '@md2nativedocx/cli';
import { deriveTemplate, referenceOdtBuffer } from '../../../scripts/build-odt-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');
const cliBin = join(here, '..', 'bin', 'md2nativedocx.mjs');

const TEN_NODES = [
  '# Report',
  '',
  '```mermaid',
  'flowchart TD',
  '  subgraph Ingest',
  '    A[Upload] --> B{Valid?}',
  '  end',
  '  subgraph Store',
  '    C[(DB)] --> D[Index]',
  '  end',
  '  B -->|yes| C',
  '  B -->|no| E[Reject]',
  '  D --> F([Search]) --> G[Results] --> I[/Export/] --> J{{Done}}',
  '  E --> H[Notify] --> J',
  '```',
  '',
  '```mermaid',
  'graph LR',
  '  X --> Y',
  '```',
  '',
].join('\n');

function contentXml(document) {
  return new AdmZip(document).readAsText('content.xml');
}

test('reference.odt: mimetype first and stored, the diagram definitions in its styles, no link', () => {
  const zip = new AdmZip(join(assets, 'reference.odt'));
  const [first] = zip.getEntries();
  assert.equal(first.entryName, 'mimetype');
  assert.equal(first.header.method, 0);
  assert.equal(zip.readAsText('mimetype'), 'application/vnd.oasis.opendocument.text');
  const styles = zip.readAsText('styles.xml');
  assert.ok(styles.includes(ODF_GRAPHIC_DEFINITIONS), 'rebuild with scripts/build-odt-assets.mjs');
  for (const entry of zip.getEntries()) {
    const text = entry.getData().toString('utf8');
    assert.ok(!/xlink:href|https?:\/\/(?!www\.w3\.org|purl\.org|openoffice\.org)|<!DOCTYPE/i.test(text.replace(/xmlns:[a-z]+="[^"]*"/g, '')), entry.entryName);
  }
});

test('reference.odt: rebuilding from reference-odt-src gives the committed file', () => {
  const committed = readFileSync(join(assets, 'reference.odt'));
  assert.ok(referenceOdtBuffer().equals(committed), 'reference.odt is stale: run scripts/build-odt-assets.mjs and commit');
});

test('the derived template differs from Pandoc 3.1.3 opendocument by the styles loop only', (t) => {
  const version = execFileSync('pandoc', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim();
  if (version !== 'pandoc 3.1.3') return t.skip(`template comparison needs pandoc 3.1.3, found ${version}`);
  // Line endings aside: Pandoc on Windows may print the template with CRLF.
  const lf = (text) => text.replace(/\r\n/g, '\n');
  const committed = lf(readFileSync(join(assets, 'md2nativedocx.opendocument'), 'utf8'));
  assert.equal(committed, deriveTemplate(lf(execFileSync('pandoc', ['-D', 'opendocument'], { encoding: 'utf8' }))));
});

test('convert({ format: "odt" }): a 10-node flowchart with subgraphs as one group of shapes and attached connectors', async () => {
  const { document, warnings } = await convert(TEN_NODES, { format: 'odt' });
  assert.equal(document.subarray(30, 38).toString('latin1'), 'mimetype');
  assert.deepEqual(warnings, []);
  const content = contentXml(document);
  const groups = content.match(/<draw:g [^>]*text:anchor-type="as-char"/g) ?? [];
  assert.equal(groups.length, 2);
  const first = content.slice(content.indexOf('<draw:g '), content.indexOf('</draw:g>'));
  assert.equal((first.match(/<draw:custom-shape /g) ?? []).length, 12, '10 nodes and 2 subgraph containers');
  assert.equal((first.match(/<draw:connector /g) ?? []).length, 10);
  // Every style a diagram uses is declared, by the derived template, in office:automatic-styles.
  const automatic = content.slice(content.indexOf('<office:automatic-styles>'), content.indexOf('</office:automatic-styles>'));
  for (const [, name] of content.matchAll(/(?:draw|text):style-name="(md2n[^"]+)"/g)) {
    assert.ok(automatic.includes(`style:name="${name}"`), name);
  }
  // Each diagram has its own prefix, so ids do not collide.
  const ids = [...content.matchAll(/xml:id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.some((id) => id.startsWith('md2n1-')) && ids.some((id) => id.startsWith('md2n2-')));
});

test('convert({ format: "odt" }): hostile labels stay text, no script or link reaches the document', async () => {
  const md = '```mermaid\ngraph TD\n  A["</text:p><office:scripts/>"] -->|"<text:a xlink:href=\'http://x\'>"| B["& \' \\""]\n```\n';
  const content = contentXml((await convert(md, { format: 'odt' })).document);
  assert.ok(!content.includes('<office:scripts'));
  assert.ok(!content.includes('<text:a '));
  assert.ok(content.includes('&lt;/text:p&gt;&lt;office:scripts/&gt;'));
});

test('convert({ format: "odt" }): other diagram types become a note and a warning', async () => {
  const { document, warnings } = await convert('```mermaid\npie\n  "a" : 1\n```\n', { format: 'odt' });
  assert.deepEqual(warnings, ['warning: Pie chart not converted: .odt output draws flowcharts only for now.']);
  assert.match(contentXml(document), /Pie chart not converted/);
});

test('convert(): unknown format and a .docx reference document for a .odt are setup errors', async () => {
  await assert.rejects(convert('x', { format: 'pdf' }), (err) => err instanceof ConversionError && err.stage === 'setup');
  await assert.rejects(
    convert('x', { format: 'odt', referenceDoc: join(assets, 'reference.docx') }),
    (err) => err instanceof ConversionError && err.stage === 'setup' && /\.odt reference/.test(err.message),
  );
});

test('CLI: -o doc.odt writes a .odt next to its log', () => {
  const dir = mkdtempSync(join(here, '.tmp-odt-'));
  try {
    writeFileSync(join(dir, 'doc.md'), TEN_NODES);
    const out = execFileSync(process.execPath, [cliBin, 'doc.md', '-o', 'doc.odt'], { cwd: dir, encoding: 'utf8' });
    assert.match(out, /Wrote doc\.odt/);
    assert.ok(contentXml(readFileSync(join(dir, 'doc.odt'))).includes('<draw:connector '));
    assert.ok(existsSync(join(dir, 'doc.log')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: a Word template in MD2NATIVEDOCX_REFERENCE_DOC does not break a .odt export', () => {
  const cwd = mkdtempSync(join(here, '.tmp-odt-'));
  try {
    writeFileSync(join(cwd, 'doc.md'), '```mermaid\ngraph TD\n  A --> B\n```\n');
    execFileSync(process.execPath, [cliBin, 'doc.md', '-o', 'doc.odt'], {
      cwd,
      env: { ...process.env, MD2NATIVEDOCX_REFERENCE_DOC: join(assets, 'reference.docx') },
      stdio: 'pipe',
    });
    assert.ok(existsSync(join(cwd, 'doc.odt')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
