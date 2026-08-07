import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'md2nativedocx.md2nativedocx';
const FIXTURE = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'sample.md');

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
});
