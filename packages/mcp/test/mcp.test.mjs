import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { JobTimeoutError, runJob } from '../src/run-job.mjs';
import { createServer, resolveOutputPath, ToolInputError } from '../src/server.mjs';

const HANG = fileURLToPath(new URL('./hang-runner.mjs', import.meta.url));
const hasPandoc = spawnSync('pandoc', ['--version']).status === 0;

async function connect(config) {
  const server = createServer(config);
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function tmpRoot() {
  return mkdtemp(join(tmpdir(), 'md2nd-mcp-'));
}

test('runJob kills a job that passes its deadline, and what it started', async () => {
  const pidFile = join(await tmpRoot(), 'pid');
  const started = Date.now();
  await assert.rejects(runJob({ tool: 'x', args: { pidFile } }, { timeoutMs: 1000, runnerPath: HANG }), JobTimeoutError);
  assert.ok(Date.now() - started < 5000);
  const pid = Number(await readFile(pidFile, 'utf8'));
  await new Promise((r) => setTimeout(r, 300));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('render_diagram reports the type and warnings, and the fragment only on request', async () => {
  const client = await connect({ root: await tmpRoot() });
  const plain = await client.callTool({ name: 'render_diagram', arguments: { source: 'flowchart TD\n A --> B' } });
  assert.notEqual(plain.isError, true);
  const summary = JSON.parse(plain.content[0].text);
  assert.equal(summary.kind, 'shapes');
  assert.equal(summary.fragment, undefined);
  assert.ok(summary.fragmentLength > 0);
  const full = await client.callTool({
    name: 'render_diagram',
    arguments: { source: 'flowchart TD\n A --> B', includeFragment: true },
  });
  assert.match(JSON.parse(full.content[0].text).fragment, /<w:p[ >]/);
});

test('render_diagram turns DiagramTooLargeError into a tool error naming the limit', async () => {
  const client = await connect({ root: await tmpRoot() });
  const edges = Array.from({ length: 900 }, (_, i) => ` n${i} --> n${i + 1}`).join('\n');
  const res = await client.callTool({ name: 'render_diagram', arguments: { source: `flowchart TD\n${edges}` } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /^DiagramTooLargeError:/);
});

test('a render that passes its deadline is a tool error, not a hung server', async () => {
  const client = await connect({ root: await tmpRoot(), renderTimeoutMs: 300, runnerPath: HANG });
  const res = await client.callTool({ name: 'render_diagram', arguments: { source: 'flowchart TD\n A --> B' } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /^JobTimeoutError:/);
  // The server still answers afterwards.
  const again = await client.callTool({ name: 'render_diagram', arguments: { source: 'flowchart TD\n A --> B' } });
  assert.match(again.content[0].text, /JobTimeoutError/);
});

test('resolveOutputPath refuses escapes, symlinked directories and non-.docx names', async () => {
  const root = await tmpRoot();
  const outside = await tmpRoot();
  await symlink(outside, join(root, 'link'));
  await assert.rejects(resolveOutputPath('../x.docx', root), ToolInputError);
  await assert.rejects(resolveOutputPath('/etc/x.docx', root), ToolInputError);
  await assert.rejects(resolveOutputPath('link/x.docx', root), ToolInputError);
  await assert.rejects(resolveOutputPath('x.txt', root), ToolInputError);
  await mkdir(join(root, 'sub'));
  assert.match(await resolveOutputPath('sub/x.docx', root), /sub[\\/]x\.docx$/);
});

test('convert_document refuses a path outside the root without running anything', async () => {
  const client = await connect({ root: await tmpRoot() });
  const res = await client.callTool({ name: 'convert_document', arguments: { markdown: '# t', outputPath: '../x.docx' } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /^ToolInputError:/);
});

test('convert_document writes a .docx under the root and never overwrites', { skip: !hasPandoc }, async () => {
  const root = await tmpRoot();
  const client = await connect({ root });
  const args = { markdown: '# T\n\n```mermaid\nflowchart TD\n A --> B\n```\n', outputPath: 'out/r.docx' };
  const res = await client.callTool({ name: 'convert_document', arguments: args });
  assert.notEqual(res.isError, true, res.content[0].text);
  const info = JSON.parse(res.content[0].text);
  assert.ok((await stat(info.outputPath)).size > 1000);
  assert.equal((await readFile(info.outputPath)).subarray(0, 2).toString(), 'PK');
  const second = await client.callTool({ name: 'convert_document', arguments: args });
  assert.equal(second.isError, true);
  await writeFile(join(root, 'keep.txt'), 'x');
});
