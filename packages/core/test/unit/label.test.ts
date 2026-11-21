import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel } from '../../src/parser/label.js';

test('a plain label keeps its Markdown markers literal; a backtick string reads them', () => {
  assert.deepEqual(parseLabel('**a**').runs, [{ text: '**a**' }]);
  assert.deepEqual(parseLabel('`**a** _b_`').runs, [{ text: 'a', bold: true }, { text: ' ' }, { text: 'b', italic: true }]);
});

test('markdown: true reads Markdown without backticks, and a newline is a line break', () => {
  const { text, runs } = parseLabel('**a**\nb', { markdown: true });
  assert.equal(text, 'a b');
  assert.deepEqual(runs, [{ text: 'a', bold: true }, { break: true }, { text: 'b' }]);
});

test('outside Markdown a newline is not a break (only <br/> is)', () => {
  assert.deepEqual(parseLabel('a<br>b').runs, [{ text: 'a' }, { break: true }, { text: 'b' }]);
});

test('an underscore inside a word opens no emphasis (CommonMark), one at a word boundary does', () => {
  assert.deepEqual(parseLabel('snake_case_name', { markdown: true }).runs, [{ text: 'snake_case_name' }]);
  assert.deepEqual(parseLabel('my__dunder__var', { markdown: true }).runs, [{ text: 'my__dunder__var' }]);
  assert.deepEqual(parseLabel('an _it_ word', { markdown: true }).runs, [{ text: 'an ' }, { text: 'it', italic: true }, { text: ' word' }]);
  assert.deepEqual(parseLabel('é_x_é', { markdown: true }).runs, [{ text: 'é_x_é' }]);
});

test('Mermaid entity codes are decoded; markup characters stay text for the translator to escape', () => {
  assert.deepEqual(parseLabel('#quot;<x> & y#quot;').runs, [{ text: '"<x> & y"' }]);
});
