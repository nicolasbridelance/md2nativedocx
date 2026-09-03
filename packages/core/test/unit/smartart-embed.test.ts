import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmartArtDrawingXml } from '../../src/smartart/embed.js';

// Same minimal well-formedness check used throughout the smartart-*.test.ts suites.
function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z0-9:_-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('<')) {
      const closing = m[1] === '/';
      const selfClosing = m[4] === '/';
      const name = m[2]!;
      if (selfClosing) continue;
      if (closing) {
        const top = stack.pop();
        assert.equal(top, name, `mismatched closing tag </${name}>`);
      } else {
        stack.push(name);
      }
    } else {
      assert.ok(!m[5]!.includes('<'), 'raw < in text content');
      assert.ok(!m[5]!.includes('>'), 'raw > in text content');
    }
  }
  assert.equal(stack.length, 0, 'unclosed tags remain');
}

const RELIDS = { dm: 'rIdData1', lo: 'rIdLayout1', qs: 'rIdStyle1', cs: 'rIdColors1' };

test('generates a well-formed <w:p> fragment', () => {
  assertWellFormedXml(buildSmartArtDrawingXml(RELIDS));
});

test('references all 4 relIds in dgm:relIds, in the right attributes', () => {
  const xml = buildSmartArtDrawingXml(RELIDS);
  assert.ok(xml.includes('r:dm="rIdData1"'));
  assert.ok(xml.includes('r:lo="rIdLayout1"'));
  assert.ok(xml.includes('r:qs="rIdStyle1"'));
  assert.ok(xml.includes('r:cs="rIdColors1"'));
});

test('accepts placeholder (non-Word-style) relIds verbatim -- callers may pass either', () => {
  const placeholders = {
    dm: 'SMARTART_PLACEHOLDER:abc-123:dm',
    lo: 'SMARTART_PLACEHOLDER:abc-123:lo',
    qs: 'SMARTART_PLACEHOLDER:abc-123:qs',
    cs: 'SMARTART_PLACEHOLDER:abc-123:cs',
  };
  const xml = buildSmartArtDrawingXml(placeholders);
  assertWellFormedXml(xml);
  assert.ok(xml.includes('r:dm="SMARTART_PLACEHOLDER:abc-123:dm"'));
});

test('uses the diagram graphicData URI, not the wpc:wpc canvas one (spec §3)', () => {
  const xml = buildSmartArtDrawingXml(RELIDS);
  assert.ok(xml.includes('uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"'));
  assert.ok(!xml.includes('wordprocessingCanvas'));
});

test('default extent is applied when no options are given', () => {
  const xml = buildSmartArtDrawingXml(RELIDS);
  assert.ok(xml.includes('cx="5486400"'));
  assert.ok(xml.includes('cy="3200400"'));
});

test('a custom extent and name override the defaults', () => {
  const xml = buildSmartArtDrawingXml(RELIDS, { widthEmu: 1000000, heightEmu: 2000000, name: 'Mon Diagramme' });
  assert.ok(xml.includes('cx="1000000"'));
  assert.ok(xml.includes('cy="2000000"'));
  assert.ok(xml.includes('name="Mon Diagramme"'));
});

test('wp:docPr id is always "1" -- document-wide renumbering is postprocess.mjs\'s job', () => {
  const xml = buildSmartArtDrawingXml(RELIDS);
  assert.ok(xml.includes('<wp:docPr id="1"'));
});
