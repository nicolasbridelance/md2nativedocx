import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigPanelHtml, escapeHtmlAttr, escapeHtmlText, stripLightMarkdown, type ConfigState } from '../../src/configPanelHtml';

function baseState(overrides: Partial<ConfigState> = {}): ConfigState {
  return {
    pageSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    marginsCustomTop: 2.5,
    marginsCustomRight: 2.5,
    marginsCustomBottom: 2.5,
    marginsCustomLeft: 2.5,
    footerPageNumber: false,
    landscapeTables: false,
    headingFont: '',
    bodyFont: '',
    fontSize: 11,
    lineSpacing: 'default',
    justify: 'left',
    accentColor: '',
    tableHeaderColor: '',
    tocEnabled: false,
    tocDepth: 3,
    emojiForceColorFont: true,
    wordCompatibilityCheckEnabled: true,
    referenceDocument: '',
    scope: 'user',
    ...overrides,
  };
}

const describe = (key: string) => `description for ${key}`;

test('escapeHtmlAttr escapes the 5 XML/HTML-significant characters', () => {
  assert.equal(escapeHtmlAttr(`"><script>&'`), '&quot;&gt;&lt;script&gt;&amp;&#39;');
});

test('escapeHtmlText escapes & < > but leaves quotes alone (text content, not an attribute)', () => {
  assert.equal(escapeHtmlText(`a & b < c > d "e" 'f'`), `a &amp; b &lt; c &gt; d "e" 'f'`);
});

test('stripLightMarkdown strips code spans, #setting# references, and markdown links', () => {
  assert.equal(stripLightMarkdown('Use `--toc` and `#md2nativedocx.toc.depth#` — see [docs](https://x)'), 'Use --toc and md2nativedocx.toc.depth — see docs');
});

test('buildConfigPanelHtml renders all 5 groups', () => {
  const html = buildConfigPanelHtml(baseState(), describe, 'nonce123');
  for (const heading of ['Mise en page', 'Typographie', 'Structure du document', 'Emoji', 'Avancé']) {
    assert.ok(html.includes(heading), `missing group heading: ${heading}`);
  }
});

test('buildConfigPanelHtml includes the CSP with the given nonce and no external resources', () => {
  const html = buildConfigPanelHtml(baseState(), describe, 'abc123');
  assert.match(html, /Content-Security-Policy/);
  assert.ok(html.includes(`script-src 'nonce-abc123'`));
  assert.ok(!html.includes('http://') && !html.includes('https://'), 'must not reference any external resource');
});

test('buildConfigPanelHtml escapes a free-text font/color value (XSS safety)', () => {
  const html = buildConfigPanelHtml(baseState({ headingFont: `"><script>alert(1)</script>` }), describe, 'n');
  assert.ok(!html.includes('<script>alert(1)</script>'), 'unescaped input must not inject a script tag');
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
});

test('buildConfigPanelHtml greys out Lot 1 layout/typography rows when a custom reference document is set, but not TOC/emoji', () => {
  const html = buildConfigPanelHtml(baseState({ referenceDocument: '/path/to/custom.docx' }), describe, 'n');
  const rows = html.split('<div class="row').slice(1);
  const pageSizeRow = rows.find((r) => r.includes('layout.pageSize'));
  const tocRow = rows.find((r) => r.includes('toc.enabled'));
  assert.ok(pageSizeRow?.startsWith(' greyed"'), 'layout.pageSize must be greyed when a custom reference doc is set');
  assert.ok(!tocRow?.startsWith(' greyed"'), 'toc.enabled must stay active regardless of a custom reference doc');
  assert.ok(html.includes('/path/to/custom.docx'), 'the effective reference document path must be shown');
});

test('buildConfigPanelHtml includes the Lot 5 landscape tables row, greyed with the rest of Lot 1 when a custom reference doc is set', () => {
  const html = buildConfigPanelHtml(baseState({ referenceDocument: '/path/to/custom.docx' }), describe, 'n');
  const rows = html.split('<div class="row').slice(1);
  const row = rows.find((r) => r.includes('layout.landscapeTables'));
  assert.ok(row, 'expected a row for layout.landscapeTables');
  assert.ok(row?.startsWith(' greyed"'), 'layout.landscapeTables must be greyed when a custom reference doc is set');
});

test('buildConfigPanelHtml does not grey anything out when no custom reference document is set', () => {
  const html = buildConfigPanelHtml(baseState(), describe, 'n');
  assert.ok(!html.includes('class="row greyed"'), 'no row should be greyed when referenceDocument is empty');
  assert.ok(!/class="row[^"]* greyed"/.test(html), 'no row (including custom-margins) should be greyed');
});

test('buildConfigPanelHtml reflects the current value of every control', () => {
  const html = buildConfigPanelHtml(
    baseState({ pageSize: 'Letter', orientation: 'landscape', fontSize: 13, tocDepth: 4, headingFont: 'Georgia' }),
    describe,
    'n',
  );
  assert.match(html, /<option value="Letter" selected>/);
  assert.match(html, /<option value="landscape" selected>/);
  assert.match(html, /data-key="typography\.fontSize" value="13"/);
  assert.match(html, /data-key="toc\.depth" value="4"/);
  assert.match(html, /data-key="typography\.headingFont" value="Georgia"/);
});

test('buildConfigPanelHtml hides the custom-margins grid unless margins is "custom"', () => {
  const hidden = buildConfigPanelHtml(baseState({ margins: 'normal' }), describe, 'n');
  const shown = buildConfigPanelHtml(baseState({ margins: 'custom' }), describe, 'n');
  assert.match(hidden, /class="row custom-margins hidden/);
  assert.doesNotMatch(shown, /class="row custom-margins hidden/);
});

test('buildConfigPanelHtml reflects the scope toggle', () => {
  const html = buildConfigPanelHtml(baseState({ scope: 'workspace' }), describe, 'n');
  assert.match(html, /value="workspace" checked/);
});

// --- 2026-09-06 redesign: macros, collapsible groups, reset, font/color pickers ---

test('buildConfigPanelHtml renders each group as a closed <details> with its own reset button', () => {
  const html = buildConfigPanelHtml(baseState(), describe, 'n');
  const detailsCount = (html.match(/<details class="group">/g) || []).length;
  assert.equal(detailsCount, 5, 'one <details> per group, none pre-opened');
  assert.ok(!html.includes('<details class="group" open'), 'groups must be closed by default');
  assert.equal((html.match(/class="reset-btn"/g) || []).length, 5, 'one reset button per group');
  assert.ok(html.includes('id="reset-all"'), 'a global reset-all button must exist');
});

test('buildConfigPanelHtml includes A3 in the page size options and right/center in justify', () => {
  const html = buildConfigPanelHtml(baseState(), describe, 'n');
  assert.match(html, /<option value="A3">/);
  assert.match(html, /<option value="right">/);
  assert.match(html, /<option value="center">/);
});

test('buildConfigPanelHtml includes the font preset macro, pre-selecting a match and falling back to custom', () => {
  const matched = buildConfigPanelHtml(baseState({ headingFont: 'Cambria', bodyFont: 'Calibri' }), describe, 'n');
  assert.match(matched, /<option value="word2007"[^>]* selected>/);
  const custom = buildConfigPanelHtml(baseState({ headingFont: 'Papyrus', bodyFont: '' }), describe, 'n');
  assert.match(custom, /<option value="custom" selected>/);
});

test('buildConfigPanelHtml includes the page preset macro, pre-selecting a match and falling back to custom', () => {
  const matched = buildConfigPanelHtml(
    baseState({ pageSize: 'A3', orientation: 'landscape', margins: 'normal' }),
    describe,
    'n',
  );
  assert.match(matched, /<option value="presentation-a3"[^>]* selected>/);
  const custom = buildConfigPanelHtml(baseState({ pageSize: 'Legal', orientation: 'landscape', margins: 'wide' }), describe, 'n');
  assert.match(custom, /id="page-preset"[^>]*>[\s\S]*?<option value="custom" selected>/);
});

test('buildConfigPanelHtml shows the manual font field only when the value is not a curated choice', () => {
  const known = buildConfigPanelHtml(baseState({ headingFont: 'Georgia' }), describe, 'n');
  const knownStart = known.indexOf('data-choice-target="typography.headingFont"');
  assert.match(known.slice(knownStart, knownStart + 900), /class="manual-font hidden"/, 'a curated font value should hide the manual input');

  const custom = buildConfigPanelHtml(baseState({ headingFont: 'Papyrus' }), describe, 'n');
  const customStart = custom.indexOf('data-choice-target="typography.headingFont"');
  const customSlice = custom.slice(customStart, customStart + 900);
  assert.match(customSlice, /<option value="__custom__" selected>/);
  assert.match(customSlice, /class="manual-font"\/>/, 'an uncurated value should show the manual input (no "hidden" class)');
});

test('buildConfigPanelHtml renders tableHeaderColor as a color row with swatches, escaping the hex value', () => {
  const html = buildConfigPanelHtml(baseState({ tableHeaderColor: 'abcdef' }), describe, 'n');
  assert.match(html, /data-key="typography\.tableHeaderColor" value="abcdef"/);
  assert.match(html, /data-color-for="typography\.tableHeaderColor" value="#abcdef"/);
  assert.ok(html.includes('data-swatch-for="typography.tableHeaderColor"'));
});

test('buildConfigPanelHtml includes a "Parcourir…" button for referenceDocument', () => {
  const html = buildConfigPanelHtml(baseState(), describe, 'n');
  assert.ok(html.includes('id="browse-reference-doc"'));
});

test('every tooltip is produced via the injected describe() function (single source of truth, spec §3.2)', () => {
  const calledWith: string[] = [];
  const spy = (key: string) => {
    calledWith.push(key);
    return `d(${key})`;
  };
  const html = buildConfigPanelHtml(baseState(), spy, 'n');
  assert.ok(calledWith.includes('layout.pageSize'));
  assert.ok(calledWith.includes('typography.accentColor'));
  assert.ok(calledWith.includes('toc.enabled'));
  assert.ok(html.includes('title="d(layout.pageSize)"'));
});
