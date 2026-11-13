import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJourney } from '../../src/diagrams/journey/parser.js';
import { translateJourneyToOoxml } from '../../src/diagrams/journey/translator.js';

const tr = (t: string): string => translateJourneyToOoxml(parseJourney(t).ast);

test('renders title, section, task, score and actor text inside the canvas envelope', () => {
  const xml = tr('journey\n  title Day\n  section Work\n    Make tea: 5: Me');
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['Day', 'Work', 'Make tea', '5/5', 'Me']) assert.ok(xml.includes(`>${text}<`), text);
});

test('score colors differ between 1 and 5', () => {
  const xml = tr('journey\n  A: 1\n  B: 5');
  assert.ok(xml.includes('E06666') && xml.includes('6AA84F'));
});

test('escapes XML metacharacters in every text position', () => {
  const xml = tr("journey\n  title <t>&\n  section <s>\n  <x>&: 3: <a>'\"");
  for (const raw of ['<t>', '<s>', '<x>', '<a>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;x&gt;&amp;'));
});

test('no external relationships; empty journey yields a note; works without actors/sections', () => {
  assert.ok(!tr('journey\n  A: 3: Me').includes('TargetMode'));
  assert.ok(tr('journey').includes('no tasks'));
  assert.ok(tr('journey\n  A: 3').includes('>A<'));
});
