import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'md2nativedocx.md2nativedocx';
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', 'test', 'fixtures');
const FIXTURE = path.join(FIXTURES_DIR, 'sample.md');
const PLAIN_FIXTURE = path.join(FIXTURES_DIR, 'plain.md');
const MMD_FIXTURE = path.join(FIXTURES_DIR, 'diagram.mmd');

async function codeLensesFor(uri: vscode.Uri): Promise<vscode.CodeLens[]> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  for (let i = 0; i < 20; i++) {
    const lenses = (await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri,
    )) ?? [];
    if (lenses.length > 0) return lenses;
    await new Promise((r) => setTimeout(r, 250));
  }
  return [];
}

suite('md2nativedocx extension host', () => {
  test('activates and registers its commands', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found — check publisher/name in package.json`);
    await ext.activate();
    assert.equal(ext.isActive, true);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('md2nativedocx.exportDocument'), 'exportDocument command missing');
    assert.ok(commands.includes('md2nativedocx.exportBlock'), 'exportBlock command missing');
  });

  test('provides two CodeLenses above a mermaid block in a real Markdown document', async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(FIXTURE));
    await vscode.window.showTextDocument(doc);

    // CodeLens resolution is async and provider-driven by VS Code itself —
    // retry briefly rather than assume the first query already has results.
    let lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < 20; i++) {
      lenses = (await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        doc.uri,
      )) ?? [];
      if (lenses.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    assert.equal(lenses.length, 2, `expected 2 CodeLenses, got ${lenses.length}`);
    const titles = lenses.map((l) => l.command?.command).sort();
    assert.deepEqual(titles, ['md2nativedocx.exportBlock', 'md2nativedocx.exportDocument']);
  });

  test('provides a single top-of-file CodeLens for a Markdown document with no mermaid block', async () => {
    const lenses = await codeLensesFor(vscode.Uri.file(PLAIN_FIXTURE));
    assert.equal(lenses.length, 1, `expected 1 CodeLens, got ${lenses.length}`);
    assert.equal(lenses[0]?.command?.command, 'md2nativedocx.exportDocument');
  });

  test('provides a single top-of-file CodeLens for a raw .mmd file', async () => {
    const lenses = await codeLensesFor(vscode.Uri.file(MMD_FIXTURE));
    assert.equal(lenses.length, 1, `expected 1 CodeLens, got ${lenses.length}`);
    assert.equal(lenses[0]?.command?.command, 'md2nativedocx.exportDocument');
  });

  test('exportDocument command exports a real .docx for a raw .mmd file (Explorer/editor context menu path)', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2nativedocx-mmd-suite-'));
    const mmdCopy = path.join(outDir, 'diagram.mmd');
    fs.copyFileSync(MMD_FIXTURE, mmdCopy);
    try {
      // Same invocation shape as a right-click "Export to Word" in the
      // Explorer/editor context menu: the command is called with the file's
      // Uri directly, no active editor/CodeLens argument involved.
      //
      // Deliberately not awaited: the command's own promise only resolves
      // after its end-of-export `showInformationMessage` (Open in Word /
      // Reveal in Explorer) is answered, which never happens with no user
      // present — awaiting it here would hang the test. The .docx is already
      // written well before that message appears, so poll for it instead.
      void vscode.commands.executeCommand('md2nativedocx.exportDocument', vscode.Uri.file(mmdCopy));
      const expected = path.join(outDir, 'diagram.docx');
      let found = false;
      for (let i = 0; i < 40; i++) {
        if (fs.existsSync(expected)) {
          found = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(found, `expected ${expected} to be created`);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
