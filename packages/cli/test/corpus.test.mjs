import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const sourceDir = join(root, 'test-corpus', 'corpus', 'source');
const corpusDir = join(root, 'test-corpus', 'corpus', 'generated');
const cli = join(root, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');

/** Extract the Mermaid diagram text from a source file (strip YAML frontmatter). */
function extractDiagram(filePath) {
  let text = readFileSync(filePath, 'utf8');
  text = text.replace(/^---[\s\S]*?---\s*\n/, '');
  return text.trim();
}

/** Wrap a diagram in a minimal Markdown document with a ```mermaid block. */
function wrapMarkdown(diagram) {
  return `# ${'Diagramme de test'}\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`;
}

/** Build the Markdown document to convert for a given source file. `.mmd`
 * sources are bare diagrams, wrapped in a minimal envelope; `.md` sources are
 * already complete documents (rich text + embedded mermaid blocks) and are
 * used as-is. */
function toMarkdown(file, diagram) {
  return file.endsWith('.md') ? diagram : wrapMarkdown(diagram);
}

/** Convert a markdown string to a .docx via the real CLI, writing both the
 * .md envelope and the .docx into dir (an ephemeral temp dir for the simple
 * tests — the assertions below are on the generated XML, not something a
 * human needs to revisit later, so nothing here is meant to persist). */
function convertTo(markdown, dir, name, env = process.env) {
  const mdPath = join(dir, `${name}.md`);
  const docxPath = join(dir, `${name}.docx`);
  writeFileSync(mdPath, markdown);
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: ['ignore', 'ignore', 'pipe'], env });
  return docxPath;
}

/** Convert a diagram to a .docx via the real CLI. The .md envelope is a
 * transient input derived from the .mmd source, so it is written to a temp dir
 * (not persisted); only the .docx artifact is kept in corpusDir. */
function convert(name, markdown, env = process.env) {
  const mdPath = join(tmpdir(), `${name}.md`);
  const docxPath = join(corpusDir, `${name}.docx`);
  writeFileSync(mdPath, markdown);
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: ['ignore', 'ignore', 'pipe'], env });
  return docxPath;
}

/** Read word/document.xml from a .docx. */
function readDocumentXml(docxPath) {
  return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
    encoding: 'utf8',
    // The large corpus diagrams produce a document.xml well past execFileSync's
    // 1 MB default, which fails with ENOBUFS rather than a useful assertion.
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Assert the .docx is a valid ZIP whose document.xml has the schema-required
 * OOXML hierarchy (spec §5.3): w:p -> w:r -> w:drawing -> wp:inline ->
 * a:graphic -> a:graphicData -> wpc:wpc -> wps:wsp shapes (no wrapping
 * wpg:wgp group around the top-level content — see ooxml-translator.ts's
 * renderContent doc comment). A subgraph, if the diagram has one, still
 * nests as its own wpg:grpSp inside the canvas. */
function assertConformantDocx(docxPath, name) {
  // Valid ZIP.
  execFileSync('unzip', ['-t', docxPath], { stdio: 'pipe' });
  const xml = readDocumentXml(docxPath);
  const ctx = `corpus file ${name}.docx`;
  assert.ok(xml.includes('<w:drawing>'), `${ctx}: missing w:drawing`);
  // Inline, not anchored: the diagram flows with the text (spec §5.3).
  assert.ok(xml.includes('<wp:inline '), `${ctx}: missing wp:inline`);
  assert.ok(!xml.includes('<wp:anchor '), `${ctx}: drawing must not be anchored`);
  assert.ok(xml.includes('<wp:extent '), `${ctx}: missing wp:extent`);
  assert.ok(xml.includes('<wp:docPr '), `${ctx}: missing wp:docPr`);
  assert.ok(xml.includes('<a:graphicData '), `${ctx}: missing a:graphicData`);
  assert.ok(xml.includes('<wpc:wpc '), `${ctx}: missing wpc:wpc canvas`);
  assert.ok(xml.includes('<wps:wsp>'), `${ctx}: missing wps:wsp shapes`);
  // The shapes must be nested inside wpc:wpc, not a bare child of body.
  const wsp = xml.indexOf('<wps:wsp>');
  const wpc = xml.indexOf('<wpc:wpc ');
  assert.ok(wsp > wpc, `${ctx}: wps:wsp must be nested inside wpc:wpc`);
  // Every wps:wsp must have a wps:cNvPr with id and name (MS-OE376).
  const cNvPrs = xml.match(/<wps:cNvPr [^>]*>/g) ?? [];
  assert.ok(cNvPrs.length > 0, `${ctx}: no wps:cNvPr found`);
  for (const c of cNvPrs) {
    assert.ok(/ id="\d+"/.test(c), `${ctx}: cNvPr missing id: ${c}`);
    assert.ok(/ name="/.test(c), `${ctx}: cNvPr missing name: ${c}`);
  }

  // The extended namespaces must be declared on the document ROOT, the way Word
  // itself emits them — the post-processing that adds them was a silent no-op
  // for a while because it searched the whole document instead of the root tag.
  const root = xml.slice(xml.indexOf('<w:document'), xml.indexOf('>', xml.indexOf('<w:document')) + 1);
  for (const prefix of ['wpc', 'wpg', 'wps']) {
    assert.ok(root.includes(`xmlns:${prefix}=`), `${ctx}: root missing xmlns:${prefix}`);
  }

  // Word treats every drawing id as one id space per document and reports the
  // file as corrupt on a collision.
  const ids = [...xml.matchAll(/<(?:wp:docPr|wpg:cNvPr|wps:cNvPr|pic:cNvPr)\s+id="(\d+)"/g)].map(
    (m) => m[1],
  );
  assert.equal(new Set(ids).size, ids.length, `${ctx}: duplicate drawing ids`);

  // Connectors must stay attached to shapes declared in their own drawing.
  for (const block of xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) ?? []) {
    const defined = new Set([...block.matchAll(/<wps:cNvPr\s+id="(\d+)"/g)].map((m) => m[1]));
    for (const [, ref] of block.matchAll(/<a:(?:stCxn|endCxn)\s+id="(\d+)"/g)) {
      assert.ok(defined.has(ref), `${ctx}: connector references undeclared shape id ${ref}`);
    }
  }

  // A drawing wider or taller than the usable page area is clipped by Word.
  for (const [, cx, cy] of xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)) {
    assert.ok(Number(cx) <= 5943600, `${ctx}: extent cx ${cx} exceeds the usable page width`);
    assert.ok(Number(cy) <= 8229600, `${ctx}: extent cy ${cy} exceeds the usable page height`);
  }

  // No external OOXML relationship (rule #3).
  assert.ok(!xml.includes('TargetMode="External"'), `${ctx}: external relationship`);
}

test('corpus: every source diagram regenerates a conformant .docx in corpus/generated/', () => {
  const files = readdirSync(sourceDir).filter((f) => f.endsWith('.mmd') || f.endsWith('.md'));
  assert.ok(files.length > 0, 'no corpus sources found');
  mkdirSync(corpusDir, { recursive: true });
  for (const file of files) {
    const diagram = extractDiagram(join(sourceDir, file));
    const name = basename(file, '.mmd').replace(/\.md$/, '');
    const docx = convert(name, toMarkdown(file, diagram));
    assertConformantDocx(docx, name);
  }
});

test('corpus mixed-content: rich Markdown (headings, table, list, blockquote, '
  + 'footnote, link, bold/italic) survives alongside two mermaid diagrams', () => {
  const source = readFileSync(join(sourceDir, 'mixed-content.md'), 'utf8');
  // SmartArt explicitly enabled (off by default since 2026-09-03, see
  // md2nativedocx.mjs's doc comment on smartArtEnabled): this test wants the
  // mixed-dispatch scenario below, not the plain-fallback default. Written to
  // an ephemeral temp dir, NOT corpusDir -- unlike the previous test, this
  // run's output isn't the corpus's checked-in `mixed-content.docx` (that one
  // must stay the default-config render, see TESTING.md chapter 3): writing
  // here into corpusDir used to silently overwrite the committed
  // default-config file with this SmartArt-on variant on every `npm test`.
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-mixed-content-'));
  try {
    const docx = convertTo(source, dir, 'mixed-content', { ...process.env, MD2NATIVEDOCX_ENABLE_SMARTART: '1' });
    assertConformantDocx(docx, 'mixed-content');
    const xml = readDocumentXml(docx);

    // Headings (H1/H2/H3) came through as heading paragraph styles, not as
    // literal text with no structure.
    assert.ok(xml.includes('w:val="Heading1"'), 'missing Heading1 style');
    assert.ok(xml.includes('w:val="Heading2"'), 'missing Heading2 style');
    assert.ok(xml.includes('w:val="Heading3"'), 'missing Heading3 style');

    // Bold / italic runs.
    assert.ok(/<w:rPr>[^<]*<w:bCs\s*\/>[^<]*<w:b\s*\/>/.test(xml) || xml.includes('<w:b/>') || xml.includes('<w:b '),
      'missing bold run');
    assert.ok(xml.includes('<w:i/>') || xml.includes('<w:i '), 'missing italic run');

    // Ordered list numbering (numPr), table, and blockquote.
    assert.ok(xml.includes('<w:numPr>'), 'missing ordered list numbering');
    assert.ok(xml.includes('<w:tbl>'), 'missing table');
    assert.ok(xml.includes('Dead-letter queue'), 'table cell text missing');
    assert.ok(xml.includes('BlockText') || xml.includes('Quote'), 'missing blockquote style');

    // Footnote and external link survive as real OOXML constructs, not flattened text.
    assert.ok(xml.includes('<w:footnoteReference'), 'missing footnote reference');
    assert.ok(xml.includes('doc interne'), 'link text missing');

    // Fenced code block: Pandoc's built-in skylighting highlighter tags each
    // token with a character style (KeywordTok, CommentTok, ...); the actual
    // colours/font live in styles.xml (checked separately below), so here we
    // only assert the tokenisation happened, not flattened to a single run.
    assert.ok(xml.includes('w:val="SourceCode"'), 'missing SourceCode paragraph style');
    assert.ok(xml.includes('w:val="KeywordTok"'), 'missing KeywordTok run (Python keyword)');
    assert.ok(xml.includes('w:val="CommentTok"'), 'missing CommentTok run (Python comment)');
    // styles.xml must actually define these styles with real formatting —
    // referencing a styleId Word doesn't know renders as plain, uncoloured text.
    const styles = execFileSync('unzip', ['-p', docx, 'word/styles.xml'], { encoding: 'utf8' });
    assert.ok(/w:styleId="KeywordTok"[\s\S]{0,200}?<w:color /.test(styles), 'KeywordTok has no colour defined');
    assert.ok(/w:styleId="VerbatimChar"[\s\S]{0,200}?<w:rFonts /.test(styles), 'VerbatimChar has no monospace font defined');

    // Both diagrams converted, no id collisions across the whole document (the
    // corpus loop's assertConformantDocx already checks this per-file, but
    // re-asserted here since this file specifically exercises two diagrams
    // interleaved with text, the scenario most likely to produce id reuse).
    // Only *one* wpc:wpc canvas, not two: the first diagram (Collecteur ->
    // File d'attente -> Worker -> Base de données, a plain 4-node chain) is
    // SmartArt-eligible and dispatches to a `dgm:relIds` diagram instead
    // (see md2nativedocx-core.mjs's SmartArt dispatch); the second (same
    // chain plus a branch to a dead-letter queue) is not -- classifyTopology
    // rejects it as `tree-too-deep` -- and still renders via the wpc:wpc path.
    assert.equal((xml.match(/<wpc:wpc /g) ?? []).length, 1, 'expected exactly one wpc:wpc canvas (the tree-too-deep diagram)');
    assert.equal((xml.match(/<dgm:relIds /g) ?? []).length, 1, 'expected exactly one SmartArt diagram (the plain chain)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('simple: markdown without mermaid produces a valid docx with no wpg:wgp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-simple-'));
  try {
    const docx = convertTo('# Titre\n\nUn paragraphe simple.\n\n- item 1\n- item 2\n', dir, 'plain');
    // Valid ZIP.
    execFileSync('unzip', ['-t', docx], { stdio: 'pipe' });
    const xml = readDocumentXml(docx);
    // No mermaid block -> no wpg:wgp.
    assert.ok(!xml.includes('<wpg:wgp'), 'plain markdown must not contain wpg:wgp');
    // The heading and paragraph text must be present.
    assert.ok(xml.includes('Titre'), 'heading text missing');
    assert.ok(xml.includes('Un paragraphe simple'), 'paragraph text missing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('simple: markdown with a mermaid A --> B dispatches to SmartArt when MD2NATIVEDOCX_ENABLE_SMARTART=1', () => {
  // A --> B is the simplest possible chain -- classifyTopology accepts it.
  // SmartArt defaults to OFF as of 2026-09-03 (a real-Word test of
  // cycle.ts's output failed to open at all on the simplest possible input
  // -- see docs/markdown-mermaid-compliance-table.md §2 point 5 -- and chain/tree
  // had no real-Word signal either, only headless LibreOffice), so this test
  // now opts in explicitly to keep covering the dispatch path itself. The
  // new default (SmartArt off unless opted in) is covered by the next test;
  // the OOXML-shapes fallback path is covered by the test after that, using
  // a fixture the classifier rejects regardless of the setting.
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-simple-'));
  try {
    const docx = convertTo('# Test\n\n```mermaid\ngraph TD\n  A --> B\n```\n', dir, 'ab', {
      ...process.env,
      MD2NATIVEDOCX_ENABLE_SMARTART: '1',
    });
    execFileSync('unzip', ['-t', docx], { stdio: 'pipe' });
    const xml = readDocumentXml(docx);
    assert.ok(xml.includes('<dgm:relIds '), 'expected a SmartArt dgm:relIds reference');
    assert.ok(!xml.includes('<wpc:wpc '), 'a SmartArt-eligible diagram must not also emit wpc:wpc shapes');
    assert.ok(!xml.includes('SMARTART_PLACEHOLDER'), 'no placeholder relIds should survive post-processing');
    // The 4 diagram parts must actually be in the package, correctly typed.
    const entries = execFileSync('unzip', ['-l', docx], { encoding: 'utf8' });
    for (const part of ['data1.xml', 'layout1.xml', 'colors1.xml', 'quickStyle1.xml']) {
      assert.ok(entries.includes(`word/diagrams/${part}`), `missing word/diagrams/${part}`);
    }
    const contentTypes = execFileSync('unzip', ['-p', docx, '\\[Content_Types\\].xml'], { encoding: 'utf8' });
    assert.ok(contentTypes.includes('diagramData+xml'), 'missing diagramData content-type override');
    const rels = execFileSync('unzip', ['-p', docx, 'word/_rels/document.xml.rels'], { encoding: 'utf8' });
    assert.ok(rels.includes('relationships/diagramData'), 'missing diagramData relationship');
    assert.ok(!rels.includes('SMARTART_PLACEHOLDER'), 'no placeholder relIds should survive in the rels file either');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('simple: markdown with a mermaid A --> B does NOT dispatch to SmartArt by default', () => {
  // Same chain-eligible fixture as the opt-in test above, run with no
  // MD2NATIVEDOCX_ENABLE_SMARTART -- confirms the 2026-09-03 default flip
  // itself, not just the opt-in path.
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-simple-'));
  try {
    const docx = convertTo('# Test\n\n```mermaid\ngraph TD\n  A --> B\n```\n', dir, 'ab-default');
    const xml = readDocumentXml(docx);
    assert.ok(!xml.includes('<dgm:relIds'), 'SmartArt must not be used unless explicitly enabled');
    assert.ok(xml.includes('<wpc:wpc '), 'expected the OOXML canvas fallback by default');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('simple: a non-SmartArt-eligible mermaid diagram still produces a conformant OOXML docx', () => {
  // Same shape-conformance coverage the old A --> B test provided, using a
  // merge-after-branch fixture (classifyTopology always rejects this shape)
  // so this specifically exercises the wpc:wpc/wps:wsp fallback path,
  // independent of whatever the classifier does or doesn't accept over time.
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-simple-'));
  try {
    const docx = convertTo(
      '# Test\n\n```mermaid\ngraph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n```\n',
      dir,
      'merge',
    );
    assertConformantDocx(docx, 'merge');
    const xml = readDocumentXml(docx);
    assert.equal((xml.match(/<wpc:wpc /g) ?? []).length, 1, 'expected exactly one wpc:wpc canvas');
    assert.ok(!xml.includes('<wpg:wgp'), 'a subgraph-free diagram must not emit a wpg:wgp');
    assert.ok(!xml.includes('<dgm:relIds'), 'a merge-after-branch diagram must not dispatch to SmartArt');
    // Four node shapes (A, B, C, D) + four connectors.
    assert.equal((xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length, 4, 'expected 4 node shapes');
    assert.equal((xml.match(/<wps:cNvCnPr>/g) ?? []).length, 4, 'expected 4 connectors');
    // The diagram must fit on a page: wp:extent within a reasonable size
    // (A4 usable width ~ 6.5in = 5943600 EMU; height ~ 9in = 8229600 EMU).
    const extent = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    assert.ok(extent, 'missing wp:extent');
    const cx = Number(extent[1]);
    const cy = Number(extent[2]);
    assert.ok(cx > 0 && cx < 5943600, `diagram width ${cx} EMU exceeds page width`);
    assert.ok(cy > 0 && cy < 8229600, `diagram height ${cy} EMU exceeds page height`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bonus finding: LaTeX math converts to native OOXML equations (m:oMath), not an image', () => {
  // Not something this project wrote — Pandoc's own docx writer (texmath)
  // already turns $...$/$$...$$ into m:oMath/m:oMathPara, editable in Word's
  // equation editor, same "native object, not a flattened image" story we
  // build by hand for diagrams (cahier des charges §2). Verified visually via
  // LibreOffice headless (2026-09-01) before trusting the XML alone — the raw
  // HTML test above is the cautionary tale for assuming Pandoc handles
  // something just because it's plausible. Pinned so a Pandoc upgrade that
  // changes this is a deliberate decision, not a silent regression.
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-math-'));
  try {
    const docx = convertTo(
      '# Formules\n\nEn ligne : $E = mc^2$.\n\nAffichée :\n\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n',
      dir,
      'math',
    );
    const xml = readDocumentXml(docx);
    assert.ok(xml.includes('<m:oMath'), 'missing m:oMath — LaTeX math was not converted to a native equation');
    assert.ok(xml.includes('<m:f>') && xml.includes('<m:num>') && xml.includes('<m:den>'), 'fraction not structured as m:f/m:num/m:den');
    assert.ok(xml.includes('<m:nary'), 'integral not structured as m:nary');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('known limitation: raw HTML (img/br/strong/div) is silently dropped, not translated', () => {
  // Pandoc's docx writer has no OOXML representation for arbitrary raw HTML
  // (unlike its html/pdf writers): a RawBlock/RawInline tagged Format "html"
  // is simply omitted from document.xml, with no warning on stderr. This is a
  // Pandoc docx-writer limitation, not a choice made by this project (cahier
  // des charges §2) — documented in test-corpus/corpus/README.md. This test
  // pins today's behaviour so a Pandoc upgrade that starts emitting a
  // fallback (or a warning) is caught deliberately instead of silently.
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-html-'));
  try {
    const md = [
      '# Titre',
      '',
      'Avant.',
      '',
      '<div align="center">',
      '<img src="https://example.com/logo.png" width="120" alt="logo" />',
      '</div>',
      '',
      'Après avec un <br/> saut et du <strong>gras via HTML</strong>.',
      '',
    ].join('\n');
    const docx = convertTo(md, dir, 'html-drop');
    const xml = readDocumentXml(docx);
    assert.ok(!xml.includes('logo.png'), 'the <img> src leaked into the docx (translation exists now — update the docs/limitation)');
    assert.ok(!xml.includes('<w:br'), 'the HTML <br/> produced a real line break (translation exists now — update the docs/limitation)');
    // The surrounding text nodes still make it through as plain, unformatted text.
    assert.ok(xml.includes('Avant.'), 'plain paragraph text around the HTML must survive');
    assert.ok(xml.includes('gras via HTML'), 'text inside an HTML tag must survive as plain text');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
