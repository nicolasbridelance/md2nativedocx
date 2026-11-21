import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNodeStyle, parseCssStyleProps } from '../../src/parser/css-style.js';

const read = (text: string) => extractNodeStyle(parseCssStyleProps(text));

test('fill, stroke and color are kept only as hex colours', () => {
  assert.deepEqual(read('fill:#f00,stroke:#336699,color:#FFF'), { fill: 'FF0000', stroke: '336699', color: 'FFFFFF' });
  assert.deepEqual(read('fill:url(javascript:x),stroke:"/><evil'), {});
});

test('a CSS colour name is read as its standard value, in any case; other words are dropped', () => {
  assert.deepEqual(read('fill:white,stroke:Yellow,color:REBECCAPURPLE'), { fill: 'FFFFFF', stroke: 'FFFF00', color: '663399' });
  assert.deepEqual(read('fill:transparent,stroke:constructor,color:__proto__'), {});
});

test('font-weight and font-style become booleans', () => {
  assert.deepEqual(read('font-weight:bold,font-style:italic'), { bold: true, italic: true });
  assert.deepEqual(read('font-weight:700'), { bold: true });
  assert.deepEqual(read('font-weight:bolder,font-style:oblique'), { bold: true, italic: true });
  assert.deepEqual(read('font-weight:normal,font-style:normal'), { bold: false, italic: false });
  assert.deepEqual(read('font-weight:400'), { bold: false });
  assert.deepEqual(read('font-weight:heavy,font-style:slanted'), {}, 'an unknown value sets nothing');
});
