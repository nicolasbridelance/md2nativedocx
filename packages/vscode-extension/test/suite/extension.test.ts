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
const QMD_FIXTURE = path.join(FIXTURES_DIR, 'sample.qmd');

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
    for (const id of ['exportBlock', 'exportDocumentPptx', 'exportBlockDocx', 'exportBlockPptx', 'openSettings']) {
      assert.ok(commands.includes(`md2nativedocx.${id}`), `${id} command missing`);
    }
  });

  test('document line at the top (Word, PowerPoint, Settings) plus "Export this diagram…" above the block', async () => {
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

    const top = lenses.filter((l) => l.range.start.line === 0).map((l) => l.command?.command).sort();
    assert.deepEqual(top, ['md2nativedocx.exportDocument', 'md2nativedocx.exportDocumentPptx', 'md2nativedocx.openSettings']);
    const onBlock = lenses.filter((l) => l.range.start.line > 0);
    assert.equal(onBlock.length, 2, 'what the diagram becomes + Export this diagram…');
    assert.ok(onBlock.some((l) => l.command?.command === 'md2nativedocx.exportBlock'));
    // Default settings (SmartArt off) on `A --> B`: Word shapes, with SmartArt offered — the lens is the enable action.
    const plan = onBlock.find((l) => l.command?.command !== 'md2nativedocx.exportBlock');
    assert.match(plan?.command?.title ?? '', /SmartArt/);
    assert.equal(plan?.command?.command, 'md2nativedocx.enableSetting');
    assert.deepEqual(plan?.command?.arguments, ['smartArt.enabled']);
  });

  test('hovering the ```mermaid line explains what the diagram becomes in Word', async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(FIXTURE));
    await vscode.window.showTextDocument(doc);
    const fence = doc.getText().split('\n').findIndex((l) => l.startsWith('```mermaid'));
    const hovers = (await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, new vscode.Position(fence, 3))) ?? [];
    const text = hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n');
    assert.match(text, /Flowchart/);
    assert.match(text, /command:md2nativedocx\.enableSetting/);
  });

  test('a Markdown document with no mermaid block: Word and Settings only (no deck to make)', async () => {
    const lenses = await codeLensesFor(vscode.Uri.file(PLAIN_FIXTURE));
    assert.deepEqual(lenses.map((l) => l.command?.command).sort(), ['md2nativedocx.exportDocument', 'md2nativedocx.openSettings']);
  });

  test('a raw .mmd file: Word, PowerPoint and Settings at the top', async () => {
    const lenses = await codeLensesFor(vscode.Uri.file(MMD_FIXTURE));
    assert.deepEqual(
      lenses.map((l) => l.command?.command).sort(),
      ['md2nativedocx.enableSetting', 'md2nativedocx.exportDocument', 'md2nativedocx.exportDocumentPptx', 'md2nativedocx.openSettings'],
      'the .mmd diagram\'s own "what it becomes" lens sits on line 0 too',
    );
  });

  test('a Quarto (.qmd) document gets the same lenses, YAML front matter included', async () => {
    const lenses = await codeLensesFor(vscode.Uri.file(QMD_FIXTURE));
    const top = lenses.filter((l) => l.range.start.line === 0).map((l) => l.command?.command).sort();
    assert.deepEqual(top, ['md2nativedocx.exportDocument', 'md2nativedocx.exportDocumentPptx', 'md2nativedocx.openSettings']);
    assert.ok(lenses.some((l) => l.command?.command === 'md2nativedocx.exportBlock' && l.range.start.line > 0));
  });

  test('right-click (Explorer, editor, tab bar) opens an md2nativedocx submenu for .md/.mmd/.qmd', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    const contributes = ext.packageJSON.contributes as {
      menus?: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
    };
    for (const place of ['explorer/context', 'editor/context', 'editor/title/context']) {
      const entry = contributes.menus?.[place]?.find((e) => e.submenu === 'md2nativedocx.submenu');
      assert.ok(entry, `expected the submenu in ${place}`);
      for (const extName of ['.md', '.mmd', '.qmd']) {
        assert.ok(entry?.when?.includes(`resourceExtname == ${extName}`), `${place}: "when" should cover ${extName}`);
      }
    }
    const items = (contributes.menus?.['md2nativedocx.submenu'] ?? []).map((e) => e.command);
    assert.deepEqual(items, [
      'md2nativedocx.exportDocument',
      'md2nativedocx.exportDocumentPptx',
      'md2nativedocx.exportBlockDocx',
      'md2nativedocx.exportBlockPptx',
      'md2nativedocx.openSettings',
    ]);
  });

  test('exportDocumentPptx command writes a real deck for a Markdown file with a diagram', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2nativedocx-pptx-suite-'));
    const mdCopy = path.join(outDir, 'deck.md');
    fs.copyFileSync(FIXTURE, mdCopy);
    try {
      // Not awaited: the command only resolves once its success toast is dismissed.
      void vscode.commands.executeCommand('md2nativedocx.exportDocumentPptx', vscode.Uri.file(mdCopy));
      const out = path.join(outDir, 'deck.pptx');
      for (let i = 0; i < 40 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 250));
      assert.ok(fs.existsSync(out), 'expected deck.pptx next to the source');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('exportDocument command exports a real .docx for a .qmd file, named after it (not "*.qmd.docx")', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2nativedocx-qmd-suite-'));
    const qmdCopy = path.join(outDir, 'report.qmd');
    fs.copyFileSync(QMD_FIXTURE, qmdCopy);
    try {
      // Same invocation shape as a right-click "Export to Word" in the
      // Explorer/editor/tab-bar context menu.
      void vscode.commands.executeCommand('md2nativedocx.exportDocument', vscode.Uri.file(qmdCopy));
      const expected = path.join(outDir, 'report.docx');
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

  test('Lot 4: declares the Activity Bar container and the config webview view', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    await ext.activate();
    const contributes = ext.packageJSON.contributes as {
      viewsContainers?: { activitybar?: Array<{ id: string }> };
      views?: Record<string, Array<{ id: string; type: string }>>;
    };
    assert.ok(
      contributes.viewsContainers?.activitybar?.some((c) => c.id === 'md2nativedocx'),
      'expected an activitybar viewsContainer with id "md2nativedocx"',
    );
    const views = contributes.views?.['md2nativedocx'] ?? [];
    const configView = views.find((v) => v.id === 'md2nativedocx.configView');
    assert.ok(configView, 'expected a view with id "md2nativedocx.configView"');
    assert.equal(configView?.type, 'webview');
  });

  test('Lot 4: the config webview resolves without throwing when revealed', async () => {
    // Real end-to-end signal beyond the pure configPanelHtml unit tests:
    // if ConfigPanelProvider.resolveWebviewView (or buildConfigPanelHtml)
    // threw, focusing the view would fail here. The rendered HTML itself
    // lives inside the webview's own iframe and isn't inspectable through
    // the extension API, so this is the practical ceiling for an
    // Extension-Development-Host-level check.
    await vscode.commands.executeCommand('workbench.view.extension.md2nativedocx');
    await vscode.commands.executeCommand('md2nativedocx.configView.focus');
  });
});
