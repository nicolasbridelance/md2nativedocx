import assert from 'node:assert/strict';
import type { Point } from '../../src/translator/elbow-connector.js';

/**
 * Where DrawingML draws a `bentConnector5` described by `xml`, re-derived independently of the code under
 * test: the preset path in the unrotated box (ECMA-376 `presetShapeDefinitions.xml`), mirrored by
 * `flipH`/`flipV` inside the box, then turned by `rot` clockwise about the box's centre.
 */
export function drawnElbow(xml: string): Point[] {
  const xfrm = /<a:xfrm([^>]*)>\s*<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(xml);
  assert.ok(xfrm, 'expected an a:xfrm');
  const attrs = xfrm[1]!;
  const [x, y, w, h] = xfrm.slice(2, 6).map(Number) as [number, number, number, number];
  const rot = Number(/rot="(\d+)"/.exec(attrs)?.[1] ?? 0) / 60000;
  const flipH = attrs.includes('flipH="1"');
  const flipV = attrs.includes('flipV="1"');
  assert.match(xml, /prst="bentConnector5"/);
  const adj = (n: number): number => Number(new RegExp(`name="adj${n}" fmla="val (-?\\d+)"`).exec(xml)![1]) / 100000;
  const x1 = w * adj(1);
  const y2 = h * adj(2);
  const x3 = w * adj(3);
  const local: Point[] = [
    { x: 0, y: 0 },
    { x: x1, y: 0 },
    { x: x1, y: y2 },
    { x: x3, y: y2 },
    { x: x3, y: h },
    { x: w, y: h },
  ];
  const angle = (rot * Math.PI) / 180;
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  return local.map((p) => {
    const dx = (flipH ? w - p.x : p.x) - w / 2;
    const dy = (flipV ? h - p.y : p.y) - h / 2;
    return { x: x + w / 2 + dx * cos - dy * sin, y: y + h / 2 + dx * sin + dy * cos };
  });
}
