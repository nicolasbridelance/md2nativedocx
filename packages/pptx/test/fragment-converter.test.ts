import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, parseMermaid, translateToOoxml } from '@md2nativedocx/core';
import { PptxConversionError } from '../src/errors.js';
import { convertFragment } from '../src/fragment-converter.js';

function flowchartFragment(source: string): string {
  const { ast } = parseMermaid(source);
  return translateToOoxml(ast, layout(ast));
}

test('rewrites shapes and connectors into p:sp / p:cxnSp with no WordprocessingML left', () => {
  const out = convertFragment(flowchartFragment('flowchart LR\n A[Start] -->|go| B{Ok?}'), { x: 0, y: 0 });
  const xml = out.shapesXml.join('');
  assert.match(xml, /<p:sp>/);
  assert.match(xml, /<p:cxnSp>/);
  assert.match(xml, /prst="diamond"/);
  assert.doesNotMatch(xml, /wps:|w:p|w:r|w:t|wpc:|wp:/);
  assert.ok(out.extent.cx > 0 && out.extent.cy > 0);
  assert.deepEqual(out.warnings, []);
});

test('connector endpoints keep pointing at the shapes they connected', () => {
  const out = convertFragment(flowchartFragment('flowchart LR\n A --> B'), { x: 0, y: 0 });
  const xml = out.shapesXml.join('');
  const shapeIds = [...xml.matchAll(/<p:cNvPr id="(\d+)" name="[^"]*" descr="[AB]"/g)].map((m) => m[1]);
  const st = /<a:stCxn id="(\d+)"/.exec(xml)?.[1];
  const end = /<a:endCxn id="(\d+)"/.exec(xml)?.[1];
  assert.deepEqual([st, end], shapeIds);
});

test('applies scale to coordinates, fonts and then the offset', () => {
  const fragment = flowchartFragment('flowchart LR\n A[Start]');
  const base = convertFragment(fragment, { x: 0, y: 0 }).shapesXml.join('');
  const big = convertFragment(fragment, { x: 1000, y: 2000, scale: 2 }).shapesXml.join('');
  const num = (xml: string, re: RegExp): number => Number(re.exec(xml)?.[1]);
  assert.equal(num(big, /<a:ext cx="(\d+)"/), num(base, /<a:ext cx="(\d+)"/) * 2);
  assert.equal(num(big, /<a:off x="(\d+)"/), num(base, /<a:off x="(\d+)"/) * 2 + 1000);
  assert.equal(num(big, /<a:rPr[^>]* sz="(\d+)"/), num(base, /<a:rPr[^>]* sz="(\d+)"/) * 2);
});

test('hostile labels stay escaped end to end (rule #2)', () => {
  const label = 'x <script>alert("1")</script> & \'q\'';
  const out = convertFragment(flowchartFragment(`flowchart LR\n A["${label.replace(/"/g, '#quot;')}"]`), { x: 0, y: 0 });
  const xml = out.shapesXml.join('');
  assert.doesNotMatch(xml, /<script>/);
  assert.match(xml, /&lt;script&gt;/);
  assert.match(xml, /&amp;/);
});

test('rejects DTD / entity declarations (XXE, rule #5)', () => {
  const evil =
    '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><w:p xmlns:w="urn:x"><w:r><w:t>&xxe;</w:t></w:r></w:p>';
  assert.throws(() => convertFragment(evil, { x: 0, y: 0 }), PptxConversionError);
});

test('never emits an external relationship or remote reference (rule #3)', () => {
  const out = convertFragment(flowchartFragment('flowchart LR\n A --> B'), { x: 0, y: 0 });
  assert.doesNotMatch(out.shapesXml.join(''), /TargetMode|https?:\/\//i);
});

test('paragraphs outside the drawing become notes', () => {
  const fragment =
    flowchartFragment('flowchart LR\n A') +
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:rPr><w:i/><w:color w:val="808080"/></w:rPr><w:t>a note &amp; more</w:t></w:r></w:p>';
  const out = convertFragment(fragment, { x: 0, y: 0 });
  assert.equal(out.notesXml.length, 1);
  assert.match(out.notesXml[0] ?? '', /i="1"/);
  assert.match(out.notesXml[0] ?? '', /a note &amp; more/);
});

test('unknown run properties are dropped with a warning, not passed through', () => {
  const fragment =
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:rPr><w:emboss/></w:rPr><w:t>x</w:t></w:r></w:p>';
  const out = convertFragment(fragment, { x: 0, y: 0 });
  assert.match(out.notesXml[0] ?? '', /<a:t>x<\/a:t>/);
  assert.doesNotMatch(out.notesXml[0] ?? '', /emboss/);
  assert.equal(out.warnings.length, 1);
});

const ROUTED = 'flowchart TD\n A --> B\n B --> C\n C --> D\n A --> D\n A --> C\n B --> D';

test('a routed edge drawn as an elbow stays a p:cxnSp, attached, with its rotation and adjustments', () => {
  const xml = convertFragment(flowchartFragment(ROUTED), { x: 0, y: 0, scale: 2 }).shapesXml.join('');
  const elbows = [...xml.matchAll(/<p:cxnSp>.*?<\/p:cxnSp>/gs)].map((m) => m[0]).filter((c) => c.includes('bentConnector5'));
  assert.ok(elbows.length > 0, 'fixture must contain a routed edge');
  for (const elbow of elbows) {
    assert.match(elbow, /<a:stCxn id="\d+"/);
    assert.match(elbow, /<a:endCxn id="\d+"/);
    assert.match(elbow, /<a:xfrm rot="5400000"/, 'a TD detour leaves downwards: a quarter turn');
    assert.match(elbow, /<a:gd name="adj3" fmla="val -?\d+"\/>/);
  }
});

test('a routed (custGeom) edge is a p:sp, never a p:cxnSp: PowerPoint repairs a connector with custom geometry', () => {
  // The translator falls back to a free-form path when no squared-off route stays clear of the nodes.
  const freeForm = flowchartFragment(ROUTED).replace(
    /<a:prstGeom prst="bentConnector5">[\s\S]*?<\/a:prstGeom>/,
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/><a:pathLst><a:path w="10" h="10"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="10" y="10"/></a:lnTo></a:path></a:pathLst></a:custGeom>',
  );
  const xml = convertFragment(freeForm, { x: 0, y: 0 }).shapesXml.join('');
  assert.match(xml, /<a:custGeom>/, 'fixture must contain a free-form edge');
  for (const m of xml.matchAll(/<p:cxnSp>.*?<\/p:cxnSp>/gs)) {
    assert.doesNotMatch(m[0], /custGeom/);
  }
});
