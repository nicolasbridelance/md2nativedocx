import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elbowConnectorGeometry, elbowRoute, type Direction, type Point } from '../../src/translator/elbow-connector.js';
import { drawnElbow } from './drawn-elbow.js';

const near = (a: Point, b: Point, tolerance: number): boolean =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

const EXITS: Record<string, Direction> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

/** A detour in EMU-sized units: 3,000,000 along the flow, the end 400,000 across, the lane `lane` across. */
function detour(exit: Direction, endAcross: number, lane: number): { start: Point; end: Point; waypoints: Point[] } {
  const across = { x: -exit.y, y: exit.x };
  const at = (u: number, v: number): Point => ({
    x: 5_000_000 + u * exit.x + v * across.x,
    y: 5_000_000 + u * exit.y + v * across.y,
  });
  return {
    start: at(0, 0),
    end: at(3_000_000, endAcross),
    waypoints: [at(200_000, lane / 2), at(600_000, lane), at(1_500_000, lane), at(2_400_000, lane), at(2_800_000, endAcross / 2)],
  };
}

for (const [name, exit] of Object.entries(EXITS)) {
  for (const side of [1, -1]) {
    test(`an elbow leaving ${name}, detour on side ${side}: Word's drawing of the preset is the route`, () => {
      const { start, end, waypoints } = detour(exit, side * 400_000, side * -900_000);
      const route = elbowRoute(start, end, exit, waypoints, () => true);
      assert.ok(route);
      assert.deepEqual(route[0], start);
      assert.deepEqual(route[5], end);
      const drawn = drawnElbow(elbowConnectorGeometry(route, exit));
      // `adj` is a percentage in thousandths: rounding moves a leg by at most a few EMU here.
      route.forEach((p, i) => assert.ok(near(drawn[i]!, p, 30), `corner ${i}: drawn ${JSON.stringify(drawn[i])}, wanted ${JSON.stringify(p)}`));
    });
  }
}

test('an elbow whose end is level with its start keeps every adj a 32-bit integer and its end within 0.03 mm', () => {
  const exit = EXITS.right!;
  const { start, end, waypoints } = detour(exit, 0, 15_000_000);
  const route = elbowRoute(start, end, exit, waypoints, () => true);
  assert.ok(route);
  const xml = elbowConnectorGeometry(route, exit);
  for (const [, value] of xml.matchAll(/fmla="val (-?\d+)"/g)) assert.ok(Math.abs(Number(value)) <= 2 ** 31 - 1);
  const drawn = drawnElbow(xml);
  assert.ok(near(drawn[5]!, end, 1_000), `end drawn at ${JSON.stringify(drawn[5])}`);
  assert.ok(near(drawn[2]!, route[2], 1_000));
});

test('the lane most of the detour runs along is tried first, the next one when it is blocked', () => {
  const exit = EXITS.right!;
  const start = { x: 0, y: 0 };
  const end = { x: 1000, y: 0 };
  const waypoints = [
    { x: 100, y: 50 },
    { x: 300, y: 80 },
    { x: 400, y: 80 },
    { x: 800, y: 80 },
    { x: 900, y: 50 },
  ];
  assert.equal(elbowRoute(start, end, exit, waypoints, () => true)?.[2].y, 80);
  const avoidLane80 = (a: Point, b: Point): boolean => !(a.y === 80 && b.y === 80);
  assert.equal(elbowRoute(start, end, exit, waypoints, avoidLane80)?.[2].y, 50);
});

test('no elbow when every lane is blocked, or the detour does not lie between the two ends', () => {
  const exit = EXITS.right!;
  const start = { x: 0, y: 0 };
  const end = { x: 1000, y: 0 };
  const lane = [
    { x: 100, y: 80 },
    { x: 900, y: 80 },
  ];
  assert.equal(elbowRoute(start, end, exit, lane, () => false), undefined);
  assert.equal(elbowRoute(start, end, exit, [{ x: -10, y: 80 }, ...lane], () => true), undefined, 'leaves backwards');
  assert.equal(elbowRoute(start, end, exit, [...lane, { x: 1100, y: 80 }], () => true), undefined, 'overshoots the end');
  assert.equal(elbowRoute(start, { x: -1000, y: 0 }, exit, lane, () => true), undefined, 'end behind the exit');
  assert.equal(elbowRoute(start, end, exit, [], () => true), undefined);
});
