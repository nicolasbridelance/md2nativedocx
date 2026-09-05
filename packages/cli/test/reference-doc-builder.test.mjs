import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolvePageSize,
  resolveMargins,
  resolveLineSpacing,
  patchTheme,
  patchStyles,
  patchSectPr,
  patchSettings,
  patchRelsForFooter,
  patchContentTypesForFooter,
  buildReferenceDoc,
  resolveMaxDrawingExtentEmu,
  PAGE_SIZES_TWIPS,
  MARGIN_PRESETS_TWIPS,
} from '../src/referenceDocBuilder.mjs';

const REFERENCE_DOC = fileURLToPath(new URL('../assets/reference.docx', import.meta.url));

// --- resolvePageSize ---

test('resolvePageSize: portrait keeps width < height for every known format', () => {
  for (const pageSize of ['A4', 'Letter', 'Legal']) {
    const { w, h, orientation } = resolvePageSize(pageSize, 'portrait');
    assert.equal(orientation, 'portrait');
    assert.ok(w < h, `${pageSize} portrait should have w < h`);
    assert.deepEqual({ w, h }, PAGE_SIZES_TWIPS[pageSize]);
  }
});

test('resolvePageSize: landscape swaps width and height', () => {
  const portrait = resolvePageSize('A4', 'portrait');
  const landscape = resolvePageSize('A4', 'landscape');
  assert.equal(landscape.w, portrait.h);
  assert.equal(landscape.h, portrait.w);
  assert.equal(landscape.orientation, 'landscape');
});

test('resolvePageSize: unrecognized page size falls back to A4', () => {
  assert.deepEqual(resolvePageSize('Tabloid', 'portrait'), resolvePageSize('A4', 'portrait'));
  assert.deepEqual(resolvePageSize(undefined, 'portrait'), resolvePageSize('A4', 'portrait'));
});

// --- resolveMargins ---

test('resolveMargins: known presets return their fixed twip values', () => {
  for (const name of Object.keys(MARGIN_PRESETS_TWIPS)) {
    assert.deepEqual(resolveMargins(name), MARGIN_PRESETS_TWIPS[name]);
  }
});

test('resolveMargins: unrecognized preset falls back to normal', () => {
  assert.deepEqual(resolveMargins('huge'), MARGIN_PRESETS_TWIPS.normal);
  assert.deepEqual(resolveMargins(undefined), MARGIN_PRESETS_TWIPS.normal);
});

test('resolveMargins: custom cm values convert to twips (1440 twip/in, 2.54cm/in)', () => {
  const result = resolveMargins('custom', { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 });
  assert.deepEqual(result, { top: 1440, right: 1440, bottom: 1440, left: 1440 });
});

test('resolveMargins: nonsensical custom values (negative/absurd) fall back to normal rather than writing them', () => {
  assert.deepEqual(resolveMargins('custom', { top: -1, right: 2, bottom: 2, left: 2 }), MARGIN_PRESETS_TWIPS.normal);
  assert.deepEqual(
    resolveMargins('custom', { top: 'not-a-number', right: 2, bottom: 2, left: 2 }),
    MARGIN_PRESETS_TWIPS.normal,
  );
});

// --- resolveLineSpacing ---

test('resolveLineSpacing: known tokens resolve to {line, rule}', () => {
  assert.deepEqual(resolveLineSpacing('single'), { line: 240, rule: 'auto' });
  assert.deepEqual(resolveLineSpacing('double'), { line: 480, rule: 'auto' });
});

test('resolveLineSpacing: "default", unset, and unknown tokens all mean "leave untouched" (null)', () => {
  assert.equal(resolveLineSpacing('default'), null);
  assert.equal(resolveLineSpacing(undefined), null);
  assert.equal(resolveLineSpacing('triple'), null);
});

// --- patchTheme ---

const THEME_FIXTURE =
  '<a:theme><a:themeElements><a:clrScheme>' +
  '<a:accent1><a:srgbClr val="4472C4" /></a:accent1>' +
  '</a:clrScheme><a:fontScheme>' +
  '<a:majorFont><a:latin typeface="Aptos Display" /></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Aptos" /></a:minorFont>' +
  '</a:fontScheme></a:themeElements></a:theme>';

test('patchTheme: each field is independently optional', () => {
  const out = patchTheme(THEME_FIXTURE, { headingFont: 'Georgia' });
  assert.ok(out.includes('<a:majorFont><a:latin typeface="Georgia" />'));
  assert.ok(out.includes('<a:minorFont><a:latin typeface="Aptos" />'), 'body font must stay untouched');
  assert.ok(out.includes('val="4472C4"'), 'accent color must stay untouched');
});

test('patchTheme: escapes XML-significant characters in a free-text font name (rule #2)', () => {
  const out = patchTheme(THEME_FIXTURE, { headingFont: 'Evil"/><a:hack/>' });
  assert.ok(!out.includes('<a:hack/>'), 'unescaped input must not inject a sibling element');
  assert.ok(out.includes('Evil&quot;/&gt;&lt;a:hack/&gt;'));
});

test('patchTheme: an invalid accent color (not 6 hex digits) is ignored, not written verbatim', () => {
  const out = patchTheme(THEME_FIXTURE, { accentColor: 'not-a-color' });
  assert.ok(out.includes('val="4472C4"'), 'original color must be preserved on invalid input');
});

test('patchTheme: a valid accent color is uppercased', () => {
  const out = patchTheme(THEME_FIXTURE, { accentColor: 'ff0000' });
  assert.ok(out.includes('val="FF0000"'));
});

// --- patchStyles ---

const STYLES_FIXTURE =
  '<w:styles>' +
  '<w:style w:styleId="Heading1"><w:rPr><w:sz w:val="32" /></w:rPr></w:style>' +
  '<w:docDefaults>' +
  '<w:rPrDefault><w:rPr><w:sz w:val="22" /><w:szCs w:val="22" /></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto" /></w:pPr></w:pPrDefault>' +
  '</w:docDefaults>' +
  '</w:styles>';

test('patchStyles: font size only touches docDefaults, not an unrelated style\'s own w:sz', () => {
  const out = patchStyles(STYLES_FIXTURE, { fontSizeHalfPt: 26 });
  assert.ok(out.includes('<w:sz w:val="32" />'), 'Heading1 own size must stay untouched');
  const docDefaults = out.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)[0];
  assert.ok(docDefaults.includes('<w:sz w:val="26" />'));
  assert.ok(docDefaults.includes('<w:szCs w:val="26" />'));
});

test('patchStyles: line spacing preserves w:after while changing w:line/w:lineRule', () => {
  const out = patchStyles(STYLES_FIXTURE, { lineSpacing: { line: 480, rule: 'auto' } });
  assert.ok(out.includes('<w:spacing w:after="160" w:line="480" w:lineRule="auto" />'));
});

test('patchStyles: justify "both" inserts w:jc, justify "left"/undefined is a no-op', () => {
  const justified = patchStyles(STYLES_FIXTURE, { justify: 'both' });
  assert.ok(justified.includes('<w:jc w:val="both" />'));
  const untouched = patchStyles(STYLES_FIXTURE, { justify: 'left' });
  assert.equal(untouched, STYLES_FIXTURE);
});

test('patchStyles: no options is a byte-identical no-op', () => {
  assert.equal(patchStyles(STYLES_FIXTURE, {}), STYLES_FIXTURE);
});

// --- patchSectPr ---

const DOCUMENT_FIXTURE = '<w:document><w:body><w:p/><w:sectPr /></w:body></w:document>';

test('patchSectPr: no pgSize and no margins is a no-op', () => {
  assert.equal(patchSectPr(DOCUMENT_FIXTURE, {}), DOCUMENT_FIXTURE);
});

test('patchSectPr: writes pgSz/pgMar from whichever of pgSize/margins was given, defaulting the other', () => {
  const out = patchSectPr(DOCUMENT_FIXTURE, { pgSize: { w: 100, h: 200, orientation: 'portrait' }, margins: null });
  assert.match(out, /<w:pgSz w:w="100" w:h="200"\/>/);
  assert.match(out, new RegExp(`w:top="${MARGIN_PRESETS_TWIPS.normal.top}"`));
});

test('patchSectPr: landscape adds w:orient="landscape"', () => {
  const out = patchSectPr(DOCUMENT_FIXTURE, { pgSize: { w: 200, h: 100, orientation: 'landscape' } });
  assert.match(out, /<w:pgSz w:w="200" w:h="100" w:orient="landscape"\/>/);
});

test('patchSectPr: footerRId alone (no pgSize/margins) still produces a full sectPr with A4/normal defaults', () => {
  const out = patchSectPr(DOCUMENT_FIXTURE, { footerRId: 'rId9' });
  assert.match(out, /<w:footerReference w:type="default" r:id="rId9"\/>/);
  assert.match(out, new RegExp(`w:top="${MARGIN_PRESETS_TWIPS.normal.top}"`));
});

test('patchSectPr: footerReference is the first child of sectPr, before pgSz (schema order, confirmed against a real Pandoc-processed sectPr)', () => {
  const out = patchSectPr(DOCUMENT_FIXTURE, {
    pgSize: { w: 100, h: 200, orientation: 'portrait' },
    footerRId: 'rId5',
  });
  const sectPr = out.match(/<w:sectPr>.*<\/w:sectPr>/)[0];
  assert.ok(sectPr.indexOf('footerReference') < sectPr.indexOf('pgSz'));
});

// --- patchRelsForFooter / patchContentTypesForFooter (spec §1.13, "Lot 1" fast-follow) ---

const RELS_FIXTURE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Type=".../styles" Id="rId2" Target="styles.xml" />' +
  '</Relationships>';

test('patchRelsForFooter: adds a footer relationship with the smallest unused rId', () => {
  const { xml, rId } = patchRelsForFooter(RELS_FIXTURE);
  assert.equal(rId, 'rId3');
  assert.match(xml, /Id="rId3" Target="footer1\.xml"/);
});

test('patchRelsForFooter: skips past a much higher pre-existing rId (e.g. a decorative external hyperlink)', () => {
  const withHighId = RELS_FIXTURE.replace(
    '</Relationships>',
    '<Relationship Type=".../hyperlink" Id="rId30" Target="http://example.com" TargetMode="External" /></Relationships>',
  );
  const { rId } = patchRelsForFooter(withHighId);
  assert.equal(rId, 'rId31');
});

const CONTENT_TYPES_FIXTURE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml" />' +
  '</Types>';

test('patchContentTypesForFooter: declares /word/footer1.xml', () => {
  const out = patchContentTypesForFooter(CONTENT_TYPES_FIXTURE);
  assert.match(out, /PartName="\/word\/footer1\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.footer\+xml"/);
});

test('patchContentTypesForFooter: idempotent — does not duplicate an existing declaration', () => {
  const once = patchContentTypesForFooter(CONTENT_TYPES_FIXTURE);
  assert.equal(patchContentTypesForFooter(once), once);
});

// --- patchSettings (spec §1.10/§2.2, "Lot 3" — applied to the *final*
// generated .docx's settings.xml by postprocess.mjs, not to the reference
// doc; see that module's tests for the integration path) ---

const SETTINGS_FIXTURE = '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>';

test('patchSettings: adds w:updateFields when toc is true', () => {
  const out = patchSettings(SETTINGS_FIXTURE, { toc: true });
  assert.match(out, /<w:settings[^>]*>\s*<w:updateFields w:val="true" \/>/);
});

test('patchSettings: no-op when toc is false/unset', () => {
  assert.equal(patchSettings(SETTINGS_FIXTURE, { toc: false }), SETTINGS_FIXTURE);
  assert.equal(patchSettings(SETTINGS_FIXTURE, {}), SETTINGS_FIXTURE);
});

test('patchSettings: idempotent — does not duplicate an existing w:updateFields', () => {
  const once = patchSettings(SETTINGS_FIXTURE, { toc: true });
  assert.equal(patchSettings(once, { toc: true }), once);
});

// --- resolveMaxDrawingExtentEmu ---

test('resolveMaxDrawingExtentEmu: null when no page option is set', () => {
  assert.equal(resolveMaxDrawingExtentEmu({}), null);
  assert.equal(resolveMaxDrawingExtentEmu({ headingFont: 'Georgia' }), null);
});

test('resolveMaxDrawingExtentEmu: shrinks when margins widen, for the same page format', () => {
  const wide = resolveMaxDrawingExtentEmu({ pageSize: 'A4', margins: 'wide' });
  const narrow = resolveMaxDrawingExtentEmu({ pageSize: 'A4', margins: 'narrow' });
  assert.ok(wide.cx < narrow.cx, 'wide margins must leave less usable width than narrow margins');
});

// --- buildReferenceDoc (integration: real unzip/zip round-trip) ---

test('buildReferenceDoc: returns null (no-op) when every option is unset', () => {
  assert.equal(buildReferenceDoc(REFERENCE_DOC, {}), null);
});

test('buildReferenceDoc: patches only the parts the given options touch, round-tripped through a real zip', () => {
  const result = buildReferenceDoc(REFERENCE_DOC, {
    pageSize: 'Letter',
    orientation: 'landscape',
    margins: 'narrow',
    headingFont: 'Georgia',
    bodyFont: 'Verdana',
    fontSizePt: 13,
    lineSpacing: '1.5',
    justify: 'both',
    accentColor: 'ff0000',
  });
  try {
    assert.ok(result.path.endsWith('.docx'));
    const documentXml = execFileSync('unzip', ['-p', result.path, 'word/document.xml'], { encoding: 'utf8' });
    assert.match(documentXml, /<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"\/>/);
    assert.match(documentXml, /w:top="720" w:right="720" w:bottom="720" w:left="720"/);

    const themeXml = execFileSync('unzip', ['-p', result.path, 'word/theme/theme1.xml'], { encoding: 'utf8' });
    assert.ok(themeXml.includes('<a:latin typeface="Georgia" />'));
    assert.ok(themeXml.includes('<a:latin typeface="Verdana" />'));
    assert.ok(themeXml.includes('val="FF0000"'));

    const stylesXml = execFileSync('unzip', ['-p', result.path, 'word/styles.xml'], { encoding: 'utf8' });
    assert.ok(stylesXml.includes('<w:sz w:val="26" />'));
    assert.ok(stylesXml.includes('w:line="360"'));
    assert.ok(stylesXml.includes('<w:jc w:val="both" />'));
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});

test('buildReferenceDoc: a single unrelated option (e.g. only fontSize) leaves the page size/theme parts untouched', () => {
  const result = buildReferenceDoc(REFERENCE_DOC, { fontSizePt: 9 });
  try {
    const documentXml = execFileSync('unzip', ['-p', result.path, 'word/document.xml'], { encoding: 'utf8' });
    assert.match(documentXml, /<w:sectPr \/>/, 'sectPr must stay untouched when no page option was given');
    const stylesXml = execFileSync('unzip', ['-p', result.path, 'word/styles.xml'], { encoding: 'utf8' });
    assert.ok(stylesXml.includes('<w:sz w:val="18" />'));
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});

test('buildReferenceDoc: footerPageNumber adds the footer part + relationship + content-type + sectPr reference, all consistent', () => {
  const result = buildReferenceDoc(REFERENCE_DOC, { footerPageNumber: true });
  try {
    const listing = execFileSync('unzip', ['-l', result.path], { encoding: 'utf8' });
    assert.ok(listing.includes('word/footer1.xml'), 'the footer part must be a new zip entry');

    const contentTypes = execFileSync('unzip', ['-p', result.path, '\\[Content_Types\\].xml'], { encoding: 'utf8' });
    assert.ok(contentTypes.includes('/word/footer1.xml'));

    const rels = execFileSync('unzip', ['-p', result.path, 'word/_rels/document.xml.rels'], { encoding: 'utf8' });
    const relMatch = rels.match(/Id="(rId\d+)" Target="footer1\.xml"/);
    assert.ok(relMatch, 'expected a relationship pointing at footer1.xml');

    const documentXml = execFileSync('unzip', ['-p', result.path, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(
      documentXml.includes(`<w:footerReference w:type="default" r:id="${relMatch[1]}"/>`),
      'sectPr must reference the same rId the relationship was minted with',
    );
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});
