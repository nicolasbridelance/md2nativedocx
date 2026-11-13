import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoriesOf, evaluate } from './audit-gate.mjs';

const report = (...advisories) => ({
  vulnerabilities: Object.fromEntries(
    advisories.map((a, i) => [
      `pkg${i}`,
      { via: ['some-dependency', { url: `https://github.com/advisories/${a.id}`, severity: a.severity, title: 't', name: `pkg${i}` }] },
    ]),
  ),
});

test('counts advisories, not the dependency-chain nodes that repeat them', () => {
  const r = { vulnerabilities: { a: { via: [{ url: 'https://x/GHSA-1', severity: 'high', name: 'p' }] }, b: { via: ['a', { url: 'https://x/GHSA-1', severity: 'high', name: 'p' }] } } };
  assert.equal(advisoriesOf(r).length, 1);
});

test('a high advisory without an exception blocks; with a live exception it is excused', () => {
  const r = report({ id: 'GHSA-1', severity: 'high' });
  assert.equal(evaluate(r, [], '2026-10-05').blocked.length, 1);
  const ex = [{ id: 'GHSA-1', expires: '2026-12-31' }];
  const out = evaluate(r, ex, '2026-10-05');
  assert.equal(out.blocked.length, 0);
  assert.equal(out.excused.length, 1);
});

test('an expired exception stops covering its advisory', () => {
  const r = report({ id: 'GHSA-1', severity: 'critical' });
  const out = evaluate(r, [{ id: 'GHSA-1', expires: '2026-01-01' }], '2026-10-05');
  assert.equal(out.blocked.length, 1);
  assert.equal(out.expiredHit.length, 1);
});

test('low and moderate advisories never block; a new high one is not covered by another id', () => {
  const r = report({ id: 'GHSA-low', severity: 'low' }, { id: 'GHSA-new', severity: 'high' });
  const out = evaluate(r, [{ id: 'GHSA-1', expires: '2026-12-31' }], '2026-10-05');
  assert.deepEqual(out.blocked.map((a) => a.id), ['GHSA-new']);
  assert.deepEqual(out.unused, ['GHSA-1']);
});
