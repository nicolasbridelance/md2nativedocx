import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { layout } from '../../src/layout/layout.js';
import { translateToOoxml } from '../../src/translator/ooxml-translator.js';

/**
 * Conformance tests for the OOXML/DrawingML output (spec §5.3, §9).
 *
 * These assert the schema-required structure that makes the generated `.docx`
 * open cleanly in Word — the exact class of bug that a well-formed-but-
 * non-conformant fragment causes (Word reports "a rencontré une erreur lors de
 * l'ouverture du fichier").
 */

function translate(text: string): string {
  const { ast } = parseMermaid(text);
  return translateToOoxml(ast, layout(ast));
}

/** Assert that `needle` appears in `haystack` strictly after `after`. */
function assertAfter(haystack: string, needle: string, after: number): number {
  const found = haystack.indexOf(needle, after + 1);
  assert.ok(found > after, `expected "${needle}" after position ${after}`);
  return found;
}

test('output is a complete w:p paragraph (block-level drawing)', () => {
  const xml = translate('graph TD\n  A --> B');
  assert.ok(xml.startsWith('<w:p '), 'must start with a w:p paragraph');
  assert.ok(xml.trimEnd().endsWith('</w:p>'), 'must end with </w:p>');
});

test('shapes are nested in the schema-required hierarchy, directly under the canvas', () => {
  const xml = translate('graph TD\n  A --> B');
  // w:p -> w:r -> w:drawing -> wp:inline -> a:graphic -> a:graphicData ->
  // wpc:wpc -> wps:wsp (top-level shapes are direct canvas children, not
  // wrapped in a wpg:wgp group — see renderContent's doc comment: a real
  // Word "Group" object bundles its contents as one click target and, per
  // user report, doubles the selection outline around the whole diagram).
  let idx = assertAfter(xml, '<w:p ', -1);
  idx = assertAfter(xml, '<w:r>', idx);
  idx = assertAfter(xml, '<w:drawing>', idx);
  idx = assertAfter(xml, '<wp:inline ', idx);
  idx = assertAfter(xml, '<wp:extent ', idx);
  idx = assertAfter(xml, '<wp:docPr ', idx);
  idx = assertAfter(xml, '<a:graphic ', idx);
  idx = assertAfter(xml, '<a:graphicData ', idx);
  idx = assertAfter(xml, '<wpc:wpc ', idx);
  idx = assertAfter(xml, '<wps:wsp>', idx);
  assert.ok(!xml.includes('<wpg:wgp'), 'top-level content must not be wrapped in a wpg:wgp group');
  // And the closing tags in reverse order.
  idx = assertAfter(xml, '</wpc:wpc>', idx);
  idx = assertAfter(xml, '</a:graphicData>', idx);
  idx = assertAfter(xml, '</a:graphic>', idx);
  idx = assertAfter(xml, '</wp:inline>', idx);
  idx = assertAfter(xml, '</w:drawing>', idx);
  idx = assertAfter(xml, '</w:r>', idx);
  assertAfter(xml, '</w:p>', idx);
});

test('wp:inline requires wp:extent and wp:docPr', () => {
  const xml = translate('graph TD\n  A --> B');
  assert.ok(xml.includes('<wp:extent '), 'wp:inline must contain wp:extent');
  assert.ok(xml.includes('<wp:docPr '), 'wp:inline must contain wp:docPr');
  // wp:extent must come before wp:docPr before a:graphic.
  const extent = xml.indexOf('<wp:extent ');
  const docPr = xml.indexOf('<wp:docPr ');
  const graphic = xml.indexOf('<a:graphic ');
  assert.ok(extent > -1 && docPr > extent && graphic > docPr);
});

test('graphicData uses the wordprocessingCanvas URI', () => {
  const xml = translate('graph TD\n  A --> B');
  assert.ok(
    xml.includes('uri="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"'),
    'graphicData must reference the wordprocessingCanvas URI for wpc:wpc',
  );
  // The group is inside a wpc:wpc canvas.
  assert.ok(xml.includes('<wpc:wpc '), 'missing wpc:wpc canvas');
  assert.ok(xml.includes('<wpc:bg>'), 'missing wpc:bg');
  assert.ok(xml.includes('<wpc:whole/>'), 'missing wpc:whole');
});

test('every wps:wsp has a wps:cNvPr with id and name (MS-OE376)', () => {
  const xml = translate('graph TD\n  A --> B');
  // 2 nodes + 1 connector = 3 wps:wsp, each with a wps:cNvPr.
  const wspCount = (xml.match(/<wps:wsp>/g) ?? []).length;
  const cNvPrCount = (xml.match(/<wps:cNvPr /g) ?? []).length;
  assert.equal(wspCount, 3);
  assert.equal(cNvPrCount, 3);
  // Every cNvPr has id and name attributes.
  const cNvPrs = xml.match(/<wps:cNvPr [^>]*>/g) ?? [];
  for (const c of cNvPrs) {
    assert.ok(/ id="\d+"/.test(c), `cNvPr missing id: ${c}`);
    assert.ok(/ name="/.test(c), `cNvPr missing name: ${c}`);
  }
});

test('connectors use wps:cNvCnPr with stCxn/endCxn referencing node ids', () => {
  const xml = translate('graph TD\n  A --> B');
  assert.ok(xml.includes('<wps:cNvCnPr>'), 'connector must use wps:cNvCnPr');
  assert.ok(xml.includes('<a:stCxn '), 'connector must have a:stCxn');
  assert.ok(xml.includes('<a:endCxn '), 'connector must have a:endCxn');
  // The stCxn/endCxn ids must reference existing wps:cNvPr ids.
  const ids = new Set((xml.match(/<wps:cNvPr id="(\d+)"/g) ?? []).map((m) => m.match(/\d+/)![0]));
  const stCxn = xml.match(/<a:stCxn id="(\d+)"/)?.[1];
  const endCxn = xml.match(/<a:endCxn id="(\d+)"/)?.[1];
  assert.ok(stCxn && ids.has(stCxn), `stCxn id ${stCxn} must reference a node`);
  assert.ok(endCxn && ids.has(endCxn), `endCxn id ${endCxn} must reference a node`);
});

test('no external OOXML relationship is emitted (rule #3)', () => {
  const xml = translate('graph TD\n  A --> B');
  assert.ok(!xml.includes('TargetMode="External"'));
  assert.ok(!xml.includes('r:link'));
  assert.ok(!xml.includes('r:embed'));
  assert.ok(!xml.includes('r:id='));
});

test('every node and edge lives directly inside the canvas, not a wrapping group', () => {
  const xml = translate('graph TD\n  A --> B\n  B --> C');
  const wpcOpen = xml.indexOf('<wpc:wpc ');
  const wpcClose = xml.lastIndexOf('</wpc:wpc>');
  assert.ok(wpcOpen > -1 && wpcClose > wpcOpen);
  const canvas = xml.slice(wpcOpen, wpcClose);
  // 3 nodes + 2 connectors, all inside the canvas, no subgraphs here so no
  // wpg:grpSp/wpg:wgp at all.
  assert.equal((canvas.match(/<wps:wsp>/g) ?? []).length, 5);
  assert.equal((canvas.match(/<wps:cNvCnPr>/g) ?? []).length, 2);
  assert.ok(!canvas.includes('<wpg:wgp'), 'no diagram without subgraphs should ever emit a wpg:wgp');
});
