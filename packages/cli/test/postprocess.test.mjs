import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  injectNamespaces,
  renumberDrawingIds,
  injectSmartArtParts,
  repositionTocAfterTitle,
  forceEmojiColorFont,
  collapseAdjacentSectionBreaks,
  collapseTrailingLandscapeSection,
  postProcessDocx,
} from '../src/postprocess.mjs';

/** A `w:document` root as Pandoc emits it: no wpc/wpg/wps declarations. */
const PANDOC_ROOT =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
  ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
  ' mc:Ignorable="w14 wp14">';

/** Build a minimal `w:drawing` block with the given ids. */
function drawing({ docPr, group, shapes, connector }) {
  return (
    '<w:drawing><wp:inline>' +
    `<wp:docPr id="${docPr}" name="Diagram"/>` +
    `<wpg:wgp><wpg:cNvPr id="${group}" name="Group"/>` +
    shapes.map((id) => `<wps:cNvPr id="${id}" name="Shape"/>`).join('') +
    `<wps:cNvPr id="${connector}" name="Connector"/>` +
    `<wps:cNvCnPr><a:stCxn id="${shapes[0]}" idx="3"/><a:endCxn id="${shapes[1]}" idx="1"/></wps:cNvCnPr>` +
    '</wpg:wgp></wp:inline></w:drawing>'
  );
}

test('injects the extended namespaces onto the document root', () => {
  const out = injectNamespaces(`${PANDOC_ROOT}<w:body/></w:document>`);
  const root = out.slice(0, out.indexOf('>') + 1);
  for (const prefix of ['wpc', 'wpg', 'wps', 'wp14']) {
    assert.ok(root.includes(`xmlns:${prefix}=`), `root is missing xmlns:${prefix}`);
  }
});

test('inline declarations in the body do not suppress the root injection', () => {
  // Regression: the check used to search the whole document, so the translator's
  // own inline `xmlns:wpg=` on `wpg:wgp` made it conclude the root was already
  // correct and skip it — the post-processing was a silent no-op.
  const body = '<w:body><wpg:wgp xmlns:wpg="urn:x" xmlns:wps="urn:y" xmlns:wpc="urn:z"/></w:body>';
  const out = injectNamespaces(`${PANDOC_ROOT}${body}</w:document>`);
  const root = out.slice(0, out.indexOf('>') + 1);
  assert.ok(root.includes('xmlns:wpg='));
  assert.ok(root.includes('xmlns:wps='));
  assert.ok(root.includes('xmlns:wpc='));
});

test('injection is idempotent', () => {
  const once = injectNamespaces(`${PANDOC_ROOT}<w:body/></w:document>`);
  assert.equal(injectNamespaces(once), once);
});

test('an existing mc:Ignorable is preserved', () => {
  const out = injectNamespaces(`${PANDOC_ROOT}<w:body/></w:document>`);
  assert.equal(out.match(/mc:Ignorable=/g).length, 1);
  assert.ok(out.includes('mc:Ignorable="w14 wp14"'));
});

test('every mc:Ignorable prefix resolves to a declared xmlns on the root — real Word rejects the file otherwise', () => {
  // Found opening a generated .docx in real Word for the first time
  // (2026-09-02): "Word found unreadable content" — the old IGNORABLE list
  // referenced w14/w15/w16* prefixes with no matching xmlns:w14 etc.
  // declared anywhere. Invalid per the markup-compatibility spec (ECMA-376
  // Part 3); LibreOffice tolerated it, real Word did not. This is the check
  // that would have caught it: every space-separated mc:Ignorable token must
  // have a corresponding xmlns:<token> in scope.
  //
  // Uses a root with no pre-existing mc:Ignorable (unlike PANDOC_ROOT below)
  // so injectNamespaces actually exercises its own IGNORABLE constant rather
  // than the "preserve what's already there" branch — that's the branch that
  // produced the real bug in production, since Pandoc's own template does
  // not set mc:Ignorable itself.
  const bareRoot = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';
  const out = injectNamespaces(`${bareRoot}<w:body/></w:document>`);
  const root = out.slice(0, out.indexOf('>') + 1);
  const ignorable = root.match(/mc:Ignorable="([^"]*)"/);
  assert.ok(ignorable, 'no mc:Ignorable on the root');
  const declaredPrefixes = new Set([...root.matchAll(/xmlns:(\w+)=/g)].map((m) => m[1]));
  for (const prefix of ignorable[1].split(/\s+/).filter(Boolean)) {
    assert.ok(declaredPrefixes.has(prefix), `mc:Ignorable references undeclared prefix "${prefix}"`);
  }
});

test('rejects a document with no w:document root', () => {
  assert.throws(() => injectNamespaces('<not-a-document/>'), /w:document/);
});

test('renumbers ids so two diagrams never collide', () => {
  // Each fragment is numbered from 1 independently by the (pure) translator, so
  // an unpatched two-diagram document always collides and Word offers to repair.
  const xml =
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 }) +
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 });
  const out = renumberDrawingIds(xml);
  const ids = [...out.matchAll(/<(?:wp:docPr|wpg:cNvPr|wps:cNvPr)\s+id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10, `duplicate ids after renumbering: ${ids.join(',')}`);
});

test('renumbering keeps each connector attached to its own shapes', () => {
  const xml =
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 }) +
    drawing({ docPr: 1, group: 2, shapes: [3, 4], connector: 5 });
  const out = renumberDrawingIds(xml);
  for (const block of out.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g)) {
    const defined = new Set([...block.matchAll(/<wps:cNvPr\s+id="(\d+)"/g)].map((m) => m[1]));
    const referenced = [...block.matchAll(/<a:(?:stCxn|endCxn)\s+id="(\d+)"/g)].map((m) => m[1]);
    assert.equal(referenced.length, 2);
    for (const ref of referenced) {
      assert.ok(defined.has(ref), `connector points outside its drawing: id ${ref}`);
    }
  }
  // The two connectors must not end up pointing at the same shapes.
  const refs = [...out.matchAll(/<a:stCxn\s+id="(\d+)"/g)].map((m) => m[1]);
  assert.notEqual(refs[0], refs[1]);
});

test('renumbering leaves a document with no drawings untouched', () => {
  const xml = '<w:body><w:p><w:r><w:t>plain</w:t></w:r></w:p></w:body>';
  assert.equal(renumberDrawingIds(xml), xml);
});

// -- injectSmartArtParts -----------------------------------------------
//
// Unlike injectNamespaces/renumberDrawingIds (pure string transforms),
// injectSmartArtParts does real ZIP I/O -- it needs an actual .docx on disk.
// These tests build the smallest package that exercises it directly, faster
// and more isolated than going through the whole Pandoc pipeline the way
// corpus.test.mjs's SmartArt tests do.

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml" />' +
  '<Override PartName="/word/document.xml" ' +
  'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />' +
  '</Types>';

const DOCUMENT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" />' +
  '</Relationships>';

/** Build a minimal but valid-enough .docx at `docxPath`, with `documentXml` as
 * `word/document.xml`. An optional `settingsXml` also writes `word/settings.xml`
 * (needed only by tests exercising the `toc` option of `postProcessDocx`). */
function buildMinimalDocx(docxPath, documentXml, settingsXml) {
  const work = mkdtempSync(join(tmpdir(), 'md2nativedocx-post-fixture-'));
  try {
    mkdirSync(join(work, 'word', '_rels'), { recursive: true });
    writeFileSync(join(work, '[Content_Types].xml'), CONTENT_TYPES, 'utf8');
    writeFileSync(join(work, 'word', 'document.xml'), documentXml, 'utf8');
    writeFileSync(join(work, 'word', '_rels', 'document.xml.rels'), DOCUMENT_RELS, 'utf8');
    if (settingsXml !== undefined) {
      writeFileSync(join(work, 'word', 'settings.xml'), settingsXml, 'utf8');
    }
    execFileSync('zip', ['-q', '-X', '-r', docxPath, '.'], { cwd: work, stdio: 'pipe' });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Write `content` as `<smartArtDir>/<id>/<name>`. */
function writeSmartArtPart(smartArtDir, id, name, content) {
  const dir = join(smartArtDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, 'utf8');
}

function withTempFiles(fn) {
  const dir = mktempTestDir();
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mktempTestDir() {
  return mkdtempSync(join(tmpdir(), 'md2nativedocx-smartart-test-'));
}

test('is a no-op when document.xml has no SmartArt placeholders', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'plain.docx');
    const documentXml = '<w:document><w:body><w:p><w:r><w:t>plain</w:t></w:r></w:p></w:body></w:document>';
    buildMinimalDocx(docx, documentXml);
    const before = readFileSync(docx);
    injectSmartArtParts(docx, join(dir, 'smartart'));
    const after = readFileSync(docx);
    assert.deepEqual(before, after, 'a document with no placeholders must be left byte-for-byte untouched');
  });
});

test('replaces placeholders with real rIds and adds the 4 parts/relationships/content-types', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'chain.docx');
    const documentXml =
      '<w:document><w:body><w:p><w:r><w:drawing>' +
      '<dgm:relIds r:dm="SMARTART_PLACEHOLDER:abc:dm" r:lo="SMARTART_PLACEHOLDER:abc:lo" ' +
      'r:qs="SMARTART_PLACEHOLDER:abc:qs" r:cs="SMARTART_PLACEHOLDER:abc:cs"/>' +
      '</w:drawing></w:r></w:p></w:body></w:document>';
    buildMinimalDocx(docx, documentXml);

    const smartArtDir = join(dir, 'smartart');
    writeSmartArtPart(smartArtDir, 'abc', 'data.xml', '<dgm:dataModel>DATA</dgm:dataModel>');
    writeSmartArtPart(smartArtDir, 'abc', 'layout.xml', '<dgm:layoutDef>LAYOUT</dgm:layoutDef>');
    writeSmartArtPart(smartArtDir, 'abc', 'colors.xml', '<dgm:colorsDef>COLORS</dgm:colorsDef>');
    writeSmartArtPart(smartArtDir, 'abc', 'quickStyle.xml', '<dgm:styleDef>STYLE</dgm:styleDef>');

    injectSmartArtParts(docx, smartArtDir);

    const outDocumentXml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(!outDocumentXml.includes('SMARTART_PLACEHOLDER'), 'no placeholder text should remain');
    const relIds = [...outDocumentXml.matchAll(/r:(?:dm|lo|qs|cs)="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(relIds).size, 4, 'all 4 relIds must be distinct');

    const rels = execFileSync('unzip', ['-p', docx, 'word/_rels/document.xml.rels'], { encoding: 'utf8' });
    for (const relId of relIds) {
      assert.ok(rels.includes(`Id="${relId}"`), `rels file is missing relationship "${relId}"`);
    }
    assert.ok(rels.includes('diagrams/data1.xml'));
    assert.ok(rels.includes('diagrams/layout1.xml'));
    assert.ok(rels.includes('diagrams/colors1.xml'));
    assert.ok(rels.includes('diagrams/quickStyle1.xml'));

    const contentTypes = execFileSync('unzip', ['-p', docx, '\\[Content_Types\\].xml'], { encoding: 'utf8' });
    assert.ok(contentTypes.includes('diagramData+xml'));
    assert.ok(contentTypes.includes('diagramLayout+xml'));
    assert.ok(contentTypes.includes('diagramColors+xml'));
    assert.ok(contentTypes.includes('diagramStyle+xml'));

    const dataXml = execFileSync('unzip', ['-p', docx, 'word/diagrams/data1.xml'], { encoding: 'utf8' });
    assert.equal(dataXml, '<dgm:dataModel>DATA</dgm:dataModel>');
  });
});

test('numbers new parts past any diagram already in the archive (no collision)', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'existing.docx');
    const documentXml =
      '<w:document><w:body><w:p><w:r><w:drawing>' +
      '<dgm:relIds r:dm="SMARTART_PLACEHOLDER:xyz:dm" r:lo="SMARTART_PLACEHOLDER:xyz:lo" ' +
      'r:qs="SMARTART_PLACEHOLDER:xyz:qs" r:cs="SMARTART_PLACEHOLDER:xyz:cs"/>' +
      '</w:drawing></w:r></w:p></w:body></w:document>';
    buildMinimalDocx(docx, documentXml);
    // Simulate a diagram that already occupies number 1, added out of band
    // (e.g. by a real Word-authored SmartArt already in a reference.docx).
    const existingDir = mkdtempSync(join(tmpdir(), 'existing-part-'));
    try {
      mkdirSync(join(existingDir, 'word', 'diagrams'), { recursive: true });
      writeFileSync(join(existingDir, 'word', 'diagrams', 'data1.xml'), '<dgm:dataModel/>', 'utf8');
      execFileSync('zip', ['-q', '-X', docx, 'word/diagrams/data1.xml'], { cwd: existingDir, stdio: 'pipe' });
    } finally {
      rmSync(existingDir, { recursive: true, force: true });
    }

    const smartArtDir = join(dir, 'smartart');
    writeSmartArtPart(smartArtDir, 'xyz', 'data.xml', '<dgm:dataModel>NEW</dgm:dataModel>');
    writeSmartArtPart(smartArtDir, 'xyz', 'layout.xml', '<dgm:layoutDef/>');
    writeSmartArtPart(smartArtDir, 'xyz', 'colors.xml', '<dgm:colorsDef/>');
    writeSmartArtPart(smartArtDir, 'xyz', 'quickStyle.xml', '<dgm:styleDef/>');

    injectSmartArtParts(docx, smartArtDir);

    const listing = execFileSync('unzip', ['-l', docx], { encoding: 'utf8' });
    assert.ok(listing.includes('word/diagrams/data1.xml'), 'the pre-existing data1.xml must survive');
    assert.ok(listing.includes('word/diagrams/data2.xml'), 'the new diagram must be numbered 2, not collide with 1');
    const data2 = execFileSync('unzip', ['-p', docx, 'word/diagrams/data2.xml'], { encoding: 'utf8' });
    assert.equal(data2, '<dgm:dataModel>NEW</dgm:dataModel>');
  });
});

test('throws a clear error when a placeholder has no matching directory in smartArtDir', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'orphan.docx');
    const documentXml =
      '<w:document><w:body><w:p><w:r><w:drawing>' +
      '<dgm:relIds r:dm="SMARTART_PLACEHOLDER:missing:dm" r:lo="SMARTART_PLACEHOLDER:missing:lo" ' +
      'r:qs="SMARTART_PLACEHOLDER:missing:qs" r:cs="SMARTART_PLACEHOLDER:missing:cs"/>' +
      '</w:drawing></w:r></w:p></w:body></w:document>';
    buildMinimalDocx(docx, documentXml);
    assert.throws(() => injectSmartArtParts(docx, join(dir, 'smartart')), /no SmartArt parts found/);
  });
});

// --- repositionTocAfterTitle (spec §1.10/§2.2, "Lot 3") ---

/** A Pandoc-shaped TOC field block, as it actually appears at the top of the
 * body — confirmed against a real `pandoc --toc` run, not invented. */
const TOC_BLOCK =
  '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents" /><w:docPartUnique /></w:docPartObj></w:sdtPr>' +
  '<w:sdtContent><w:p><w:pPr><w:pStyle w:val="TOCHeading" /></w:pPr><w:r><w:t>Table of Contents</w:t></w:r></w:p>' +
  '<w:p><w:r><w:fldChar w:fldCharType="begin" /><w:instrText>TOC \\o "1-2" \\h \\z \\u</w:instrText>' +
  '<w:fldChar w:fldCharType="separate" /><w:fldChar w:fldCharType="end" /></w:r></w:p></w:sdtContent></w:sdt>';

const HEADING1 = '<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Titre</w:t></w:r></w:p>';

test('repositionTocAfterTitle: moves the TOC field from the top of the body to right after the first Heading1', () => {
  const xml = `<w:document><w:body>${TOC_BLOCK}${HEADING1}<w:p><w:r><w:t>Reste</w:t></w:r></w:p></w:body></w:document>`;
  const out = repositionTocAfterTitle(xml);
  const h1Idx = out.indexOf('Heading1');
  const tocIdx = out.indexOf('docPartGallery');
  assert.ok(h1Idx < tocIdx, 'the TOC field must now come after the Heading1 paragraph');
  assert.ok(out.indexOf('Reste') > tocIdx, 'content after the title must still come after the TOC');
});

test('repositionTocAfterTitle: a no-op when there is no TOC field', () => {
  const xml = `<w:document><w:body>${HEADING1}</w:body></w:document>`;
  assert.equal(repositionTocAfterTitle(xml), xml);
});

test('repositionTocAfterTitle: leaves the TOC at the top (not dropped) when there is no Heading1 to anchor after', () => {
  const xml = `<w:document><w:body>${TOC_BLOCK}<w:p><w:r><w:t>No heading here</w:t></w:r></w:p></w:body></w:document>`;
  assert.equal(repositionTocAfterTitle(xml), xml);
});

// --- postProcessDocx({ toc }) (spec §1.10/§2.2, "Lot 3") ---

const MINIMAL_SETTINGS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>';

test('postProcessDocx: without toc, settings.xml is left untouched (not even read)', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'doc.docx');
    buildMinimalDocx(docx, `<w:document><w:body>${HEADING1}</w:body></w:document>`, MINIMAL_SETTINGS);
    postProcessDocx(docx);
    const settings = execFileSync('unzip', ['-p', docx, 'word/settings.xml'], { encoding: 'utf8' });
    assert.equal(settings, MINIMAL_SETTINGS);
  });
});

test('postProcessDocx: with toc, settings.xml gets w:updateFields and the TOC field moves after the title', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'doc.docx');
    const documentXml = `<w:document><w:body>${TOC_BLOCK}${HEADING1}</w:body></w:document>`;
    buildMinimalDocx(docx, documentXml, MINIMAL_SETTINGS);
    postProcessDocx(docx, { toc: true });

    const settings = execFileSync('unzip', ['-p', docx, 'word/settings.xml'], { encoding: 'utf8' });
    assert.match(settings, /<w:updateFields w:val="true" \/>/);

    const document = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(document.indexOf('Heading1') < document.indexOf('docPartGallery'));
  });
});

// --- forceEmojiColorFont (spec §1.15/§2.5, "Lot 2") ---
//
// Fixtures below are Pandoc's own real output shape (confirmed against an
// actual `pandoc` run — see TODO.md), not invented: a whole sentence in one
// `<w:r>`, bold/italic as `<w:rPr><w:b/></w:rPr>`.

test('forceEmojiColorFont: a run with no pictographic character is untouched', () => {
  const run = '<w:r><w:t xml:space="preserve">Texte normal, rien a faire.</w:t></w:r>';
  assert.equal(forceEmojiColorFont(run), run);
});

test('forceEmojiColorFont: splits a mixed run at grapheme boundaries, forcing the font only on the emoji segment', () => {
  const run = '<w:r><w:t xml:space="preserve">Statut : ✅ fait</w:t></w:r>';
  const out = forceEmojiColorFont(run);
  assert.equal(out, [
    '<w:r><w:t xml:space="preserve">Statut : </w:t></w:r>',
    '<w:r><w:rPr><w:rFonts w:ascii="Segoe UI Emoji" w:hAnsi="Segoe UI Emoji" w:eastAsia="Segoe UI Emoji" w:cs="Segoe UI Emoji"/></w:rPr><w:t xml:space="preserve">✅</w:t></w:r>',
    '<w:r><w:t xml:space="preserve"> fait</w:t></w:r>',
  ].join(''));
});

test('forceEmojiColorFont: preserves an existing rPr (e.g. bold) on both the plain and the emoji segment', () => {
  const run = '<w:r><w:rPr><w:bCs /><w:b /></w:rPr><w:t xml:space="preserve">✅ fait</w:t></w:r>';
  const out = forceEmojiColorFont(run);
  assert.match(out, /^<w:r><w:rPr><w:rFonts[^>]*\/><w:bCs \/><w:b \/><\/w:rPr><w:t xml:space="preserve">✅<\/w:t><\/w:r>/);
  assert.match(out, /<w:r><w:rPr><w:bCs \/><w:b \/><\/w:rPr><w:t xml:space="preserve"> fait<\/w:t><\/w:r>$/);
});

test('forceEmojiColorFont: a multi-codepoint emoji (variation selector) is not split from its base character', () => {
  const run = '<w:r><w:t xml:space="preserve">⚠️ attention</w:t></w:r>';
  const out = forceEmojiColorFont(run);
  assert.ok(out.includes('>⚠️<'), 'the base + variation selector must stay in the same <w:t>');
});

test('forceEmojiColorFont: a regional-indicator flag pair is classified as emoji even though neither half is Extended_Pictographic alone', () => {
  const run = '<w:r><w:t xml:space="preserve">🇫🇷 drapeau</w:t></w:r>';
  const out = forceEmojiColorFont(run);
  assert.ok(out.includes('>🇫🇷<'));
  assert.ok(out.includes('Segoe UI Emoji'));
});

test('forceEmojiColorFont: a run wrapping a drawing (not plain text) is left untouched', () => {
  const run = '<w:r><w:drawing><wp:inline><wp:docPr id="1" name="✅"/></wp:inline></w:drawing></w:r>';
  assert.equal(forceEmojiColorFont(run), run, 'must not touch attribute values or non-w:t content');
});

test('postProcessDocx: emojiFont defaults to true — a checkmark run gets the font forced without an explicit option', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'doc.docx');
    buildMinimalDocx(docx, '<w:document><w:body><w:p><w:r><w:t xml:space="preserve">✅ fait</w:t></w:r></w:p></w:body></w:document>');
    postProcessDocx(docx);
    const document = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(document.includes('Segoe UI Emoji'));
  });
});

test('postProcessDocx: emojiFont: false opts out entirely', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'doc.docx');
    buildMinimalDocx(docx, '<w:document><w:body><w:p><w:r><w:t xml:space="preserve">✅ fait</w:t></w:r></w:p></w:body></w:document>');
    postProcessDocx(docx, { emojiFont: false });
    const document = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(!document.includes('Segoe UI Emoji'), 'emojiFont: false must not force any font');
    assert.ok(document.includes('✅ fait'), 'the emoji run must stay a single, unsplit run');
  });
});

// --- collapseAdjacentSectionBreaks / collapseTrailingLandscapeSection
// (spec §1.9/§2.3, "Lot 5" — ADR 0005's blank-page trap) ---
//
// Fixtures are the exact shape `md2nativedocx.lua` emits: a `<w:p>` whose
// only content is `<w:pPr><w:sectPr>...</w:sectPr></w:pPr>` — Pandoc itself
// never produces this shape (confirmed empirically, see the doc comment on
// these functions), so it is safe to treat it as unambiguously ours.

const PORTRAIT_SECTPR_PARA =
  '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
  '</w:sectPr></w:pPr></w:p>';
const LANDSCAPE_SECTPR_PARA =
  '<w:p><w:pPr><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' +
  '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
  '</w:sectPr></w:pPr></w:p>';
const HEADER_AND_TABLE =
  '<w:p><w:pPr><w:pStyle w:val="Heading2" /></w:pPr><w:r><w:t>Table one</w:t></w:r></w:p>' +
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
const BOOKMARK_PAIR = '<w:bookmarkStart w:id="1" w:name="x" /><w:bookmarkEnd w:id="1" />';

test('collapseAdjacentSectionBreaks: no-op on a document with no sectPr-only paragraph', () => {
  const xml = `<w:document><w:body>${HEADER_AND_TABLE}<w:sectPr /></w:body></w:document>`;
  assert.equal(collapseAdjacentSectionBreaks(xml), xml);
});

test('collapseAdjacentSectionBreaks: deletes two directly-adjacent sectPr-only paragraphs, keeping the gap', () => {
  const xml =
    `<w:document><w:body>${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}${BOOKMARK_PAIR}${PORTRAIT_SECTPR_PARA}` +
    `${HEADER_AND_TABLE}<w:sectPr /></w:body></w:document>`;
  const out = collapseAdjacentSectionBreaks(xml);
  assert.ok(!out.includes('<w:sectPr>'), 'both synthetic sectPr paragraphs must be gone');
  assert.ok(out.includes(BOOKMARK_PAIR), 'the bookmark gap between them must be preserved');
  assert.equal((out.match(/Table one/g) ?? []).length, 2, 'both real Header+Table blocks must survive untouched');
});

test('collapseAdjacentSectionBreaks: does not touch a Header+Table sitting between two matches (regression: must not swallow real content)', () => {
  // Reproduces the bug found empirically: an early version's lazy capture
  // matched clear across an entire Header+Table block to reach a *later*
  // occurrence of the closing sequence, corrupting the document. Real
  // content between two sectPr-only paragraphs must block the collapse.
  const xml =
    `<w:document><w:body>${PORTRAIT_SECTPR_PARA}${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}` +
    `<w:sectPr /></w:body></w:document>`;
  const out = collapseAdjacentSectionBreaks(xml);
  assert.equal(out, xml, 'a real Header+Table between two sectPr paragraphs must prevent collapsing');
});

test('collapseAdjacentSectionBreaks: collapses a run of 3 contiguous pairs completely, not just pairwise', () => {
  const xml =
    `<w:document><w:body>${HEADER_AND_TABLE}` +
    `${LANDSCAPE_SECTPR_PARA}${PORTRAIT_SECTPR_PARA}${HEADER_AND_TABLE}` +
    `${LANDSCAPE_SECTPR_PARA}${PORTRAIT_SECTPR_PARA}${HEADER_AND_TABLE}` +
    `${LANDSCAPE_SECTPR_PARA}<w:sectPr /></w:body></w:document>`;
  const out = collapseAdjacentSectionBreaks(xml);
  assert.equal((out.match(/<w:sectPr>/g) ?? []).length, 1, 'only the final closing paragraph should remain');
  assert.equal((out.match(/Table one/g) ?? []).length, 3, 'all three real Header+Table blocks must survive');
});

test('collapseTrailingLandscapeSection: merges into a self-closed body-final sectPr and drops the paragraph', () => {
  const xml = `<w:document><w:body>${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}<w:sectPr /></w:body></w:document>`;
  const out = collapseTrailingLandscapeSection(xml);
  assert.equal((out.match(/<w:sectPr/g) ?? []).length, 1, 'only one sectPr should remain');
  assert.match(out, /<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>[\s\S]*<\/w:sectPr><\/w:body>/);
});

test('collapseTrailingLandscapeSection: merges into an already-populated body-final sectPr (Lot 1 page settings), overwriting it', () => {
  const xml =
    `<w:document><w:body>${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}` +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>';
  const out = collapseTrailingLandscapeSection(xml);
  assert.ok(!out.includes('12240'), 'the old (now-superseded) body-final page size must be replaced, not kept alongside');
  assert.match(out, /orient="landscape"/);
});

test('collapseTrailingLandscapeSection: tolerates bookmark tags between the paragraph and the body-final sectPr', () => {
  const xml = `<w:document><w:body>${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}${BOOKMARK_PAIR}<w:sectPr /></w:body></w:document>`;
  const out = collapseTrailingLandscapeSection(xml);
  assert.ok(out.includes(BOOKMARK_PAIR));
  assert.match(out, /orient="landscape"/);
});

test('collapseTrailingLandscapeSection: no-op when real content follows the landscape section', () => {
  const xml =
    `<w:document><w:body>${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}` +
    `<w:p><w:r><w:t>After</w:t></w:r></w:p><w:sectPr /></w:body></w:document>`;
  assert.equal(collapseTrailingLandscapeSection(xml), xml);
});

test('postProcessDocx: collapses a trailing landscape table section end to end (no separate opt-in flag — always safe to run)', () => {
  withTempFiles((dir) => {
    const docx = join(dir, 'doc.docx');
    const documentXml = `<w:document><w:body>${HEADER_AND_TABLE}${LANDSCAPE_SECTPR_PARA}<w:sectPr /></w:body></w:document>`;
    buildMinimalDocx(docx, documentXml);
    postProcessDocx(docx);
    const document = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.equal((document.match(/<w:sectPr/g) ?? []).length, 1);
    assert.match(document, /orient="landscape"/);
  });
});
