import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeline } from '../../src/diagrams/timeline/parser.js';
import { translateTimelineToOoxml } from '../../src/diagrams/timeline/translator.js';

const tr = (t: string): string => translateTimelineToOoxml(parseTimeline(t).ast);

test('renders period and event text inside the canvas envelope', () => {
  const xml = tr('timeline\n  title T\n  2002 : LinkedIn\n  2004 : Facebook : Google');
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['T', '2002', 'LinkedIn', 'Facebook', 'Google']) assert.ok(xml.includes(`>${text}<`), text);
});

test('forced <br> becomes separate paragraphs; long text wraps', () => {
  const brXml = tr('timeline\n  P : one<br>two');
  assert.ok(brXml.includes('>one<') && brXml.includes('>two<'));
  const long = tr('timeline\n  P : ' + 'word '.repeat(30));
  assert.ok((long.match(/>word/g) ?? []).length > 1);
});

test('sections add a band row with the section name', () => {
  assert.ok(tr('timeline\n  section Stone Age\n  A : x').includes('>Stone Age<'));
});

test('escapes XML metacharacters', () => {
  const xml = tr("timeline\n  title <b>&\n  <x>& : \"q\" '");
  assert.ok(!xml.includes('<x>') && !xml.includes('<b>'));
  assert.ok(xml.includes('&lt;x&gt;&amp;'));
});

test('no external relationships; empty timeline yields a note', () => {
  assert.ok(!tr('timeline\n  A : x').includes('TargetMode'));
  assert.ok(tr('timeline').includes('no periods'));
});
