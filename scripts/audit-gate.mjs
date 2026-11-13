#!/usr/bin/env node
/**
 * Dependency-audit gate for CI: fails on any high/critical advisory that is not listed in
 * `audit-exceptions.json`. An exception needs a reason and an expiry date; an expired exception
 * stops covering its advisory, so every known-and-accepted risk is re-reviewed on a schedule.
 *
 * Why not plain `npm audit --audit-level=high`: some advisories have no patched version at all, so
 * no update can turn the job green, while a permanently red job hides the next real finding.
 *
 * Usage: `node scripts/audit-gate.mjs [--input audit.json] [--today YYYY-MM-DD]`
 * (`--input`/`--today` exist for tests; by default it runs `npm audit --json` via an argument array.)
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAILING = new Set(['high', 'critical']);

/** Collect distinct advisories (not dependency-chain nodes) from an `npm audit --json` report. */
export function advisoriesOf(report) {
  const found = new Map();
  for (const node of Object.values(report.vulnerabilities ?? {})) {
    for (const via of node.via ?? []) {
      if (typeof via !== 'object' || via === null || typeof via.url !== 'string') continue;
      const id = via.url.split('/').pop() ?? via.url;
      if (!found.has(id)) found.set(id, { id, severity: via.severity, title: via.title, package: via.name });
    }
  }
  return [...found.values()];
}

/**
 * Split failing advisories into unexcused ones and the exceptions that cover them.
 * @param {object} report parsed `npm audit --json`
 * @param {Array<{id: string, expires: string}>} exceptions
 * @param {string} today ISO date (YYYY-MM-DD)
 */
export function evaluate(report, exceptions, today) {
  const active = new Map(exceptions.filter((e) => e.expires >= today).map((e) => [e.id, e]));
  const expired = new Map(exceptions.filter((e) => e.expires < today).map((e) => [e.id, e]));
  const failing = advisoriesOf(report).filter((a) => FAILING.has(a.severity));
  return {
    blocked: failing.filter((a) => !active.has(a.id)),
    excused: failing.filter((a) => active.has(a.id)),
    expiredHit: failing.filter((a) => expired.has(a.id)),
    unused: [...active.keys()].filter((id) => !failing.some((a) => a.id === id)),
  };
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const today = arg('--today') ?? new Date().toISOString().slice(0, 10);
  const exceptions = JSON.parse(readFileSync(new URL('../audit-exceptions.json', import.meta.url), 'utf8'));
  let raw;
  if (arg('--input')) {
    raw = readFileSync(arg('--input'), 'utf8');
  } else {
    // npm exits non-zero whenever it finds anything; the JSON on stdout is what we need.
    const res = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    raw = res.stdout;
  }
  const result = evaluate(JSON.parse(raw), exceptions, today);
  for (const a of result.excused) console.log(`excepted  ${a.severity}  ${a.id}  ${a.package}: ${a.title}`);
  for (const id of result.unused) console.log(`note: exception ${id} no longer matches any advisory; remove it.`);
  for (const a of result.expiredHit) console.error(`EXPIRED exception for ${a.id} (${a.package}); re-review it.`);
  for (const a of result.blocked) console.error(`BLOCKED   ${a.severity}  ${a.id}  ${a.package}: ${a.title}`);
  if (result.blocked.length > 0) {
    console.error(`\naudit gate failed: ${result.blocked.length} high/critical advisory(ies) without a valid exception.`);
    return 1;
  }
  console.log(`audit gate passed (${result.excused.length} excepted advisory(ies)).`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
