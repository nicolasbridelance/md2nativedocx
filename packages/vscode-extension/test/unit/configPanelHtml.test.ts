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
    headingFont: '',
    bodyFont: '',
    fontSize: 11,
    lineSpacing: 'default',
    justify: 'left',
    accentColor: '',
    tocEnabled: false,
    tocDepth: 3,
    emojiForceColorFont: true,
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
