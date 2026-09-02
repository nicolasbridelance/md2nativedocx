import * as vscode from 'vscode';
import { basename } from 'node:path';
import { MermaidCodeLensProvider } from './codeLensProvider';
import { registerStatusBar } from './statusBar';
import { parseMermaidBlocks } from './mermaidBlocks';
import {
  exportDocument,
  exportBlock,
  resolveBlockForCursor,
  PandocMissingError,
  BlockNotFoundError,
  ExportFailedError,
} from './exportService';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('md2nativedocx');
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new MermaidCodeLensProvider()),
    vscode.commands.registerCommand('md2nativedocx.exportDocument', (uri?: vscode.Uri) =>
      handleExportDocument(uri),
    ),
    vscode.commands.registerCommand('md2nativedocx.exportBlock', (uri?: vscode.Uri, blockIndex?: number) =>
      handleExportBlock(uri, blockIndex),
    ),
  );

  registerStatusBar(context);
}

export function deactivate(): void {
  // Nothing to tear down beyond what `context.subscriptions` already disposes.
}

function outputDirectorySetting(): string {
  return vscode.workspace.getConfiguration('md2nativedocx').get<string>('outputDirectory', '');
}

async function resolveMarkdownUri(uri: vscode.Uri | undefined): Promise<vscode.Uri | null> {
  if (uri) return uri;
  const active = vscode.window.activeTextEditor;
  if (active && active.document.languageId === 'markdown') return active.document.uri;
  void vscode.window.showErrorMessage(vscode.l10n.t('Open a Markdown (.md) file first.'));
  return null;
}

async function handleExportDocument(uriArg?: vscode.Uri): Promise<void> {
  const uri = await resolveMarkdownUri(uriArg);
  if (!uri) return;
  await runExportFlow(() => exportDocument(uri.fsPath, outputDirectorySetting()));
}

async function handleExportBlock(uriArg?: vscode.Uri, blockIndexArg?: number): Promise<void> {
  const uri = await resolveMarkdownUri(uriArg);
  if (!uri) return;

  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  let blockIndex = blockIndexArg;

  if (blockIndex === undefined) {
    // Invoked from the Command Palette (no CodeLens argument): fall back to
    // the block under the cursor, the sole block if unambiguous, or a picker.
    const active = vscode.window.activeTextEditor;
    const cursorLine = active && active.document.uri.toString() === uri.toString() ? active.selection.active.line : 0;
    const resolved = resolveBlockForCursor(text, cursorLine);
    if (resolved) {
      blockIndex = resolved.index;
    } else {
      const blocks = parseMermaidBlocks(text);
      if (blocks.length === 0) {
        void vscode.window.showErrorMessage(vscode.l10n.t('No mermaid diagram found in this document.'));
        return;
      }
      const pick = await vscode.window.showQuickPick(
        blocks.map((b) => ({
          label: b.precedingHeading ?? vscode.l10n.t('Diagram {0}', b.index + 1),
          description: vscode.l10n.t('line {0}', b.fenceLine + 1),
          block: b,
        })),
        { placeHolder: vscode.l10n.t('Which diagram to export?') },
      );
      if (!pick) return;
      blockIndex = pick.block.index;
    }
  }

  await runExportFlow(() => exportBlock(uri.fsPath, text, blockIndex as number, outputDirectorySetting()));
}

type ExportOutcome = { ok: true; outputPath: string } | { ok: false; error: unknown };

/** The 4-state export UX from UX_SPEC.md Partie 1: repos (nothing shown
 * until triggered) -> en cours (progress toast, never a silent freeze) ->
 * succès (actions that close the loop in one click) | erreur (explicit
 * message + a repair action, never a raw stack trace in the toast).
 *
 * The progress toast only wraps `run()` — resolving (and disappearing) the
 * moment the export itself settles, success or failure. Found while
 * recording the demo GIF: `showInformationMessage` used to be awaited
 * *inside* the withProgress callback, so the spinner stayed on screen until
 * the user clicked an action on the success toast, well after the export had
 * actually finished (visible as two stacked notifications in the recording). */
async function runExportFlow(run: () => Promise<{ outputPath: string }>): Promise<void> {
  const outcome = await vscode.window.withProgress<ExportOutcome>(
    { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Export in progress'), cancellable: false },
    async () => {
      try {
        const { outputPath } = await run();
        return { ok: true, outputPath };
      } catch (error) {
        return { ok: false, error };
      }
    },
  );

  if (!outcome.ok) {
    await handleExportError(outcome.error);
    return;
  }

  const openInWord = vscode.l10n.t('Open in Word');
  const revealInExplorer = vscode.l10n.t('Reveal in Explorer');
  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t('Exported: {0}', basename(outcome.outputPath)),
    openInWord,
    revealInExplorer,
  );
  if (choice === openInWord) {
    await vscode.env.openExternal(vscode.Uri.file(outcome.outputPath));
  } else if (choice === revealInExplorer) {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outcome.outputPath));
  }
}

async function handleExportError(err: unknown): Promise<void> {
  if (err instanceof PandocMissingError) {
    const installPandoc = vscode.l10n.t('Install Pandoc');
    const choice = await vscode.window.showErrorMessage(
      vscode.l10n.t('Pandoc could not be found on this machine.'),
      installPandoc,
    );
    if (choice === installPandoc) {
      await vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
    }
    return;
  }
  if (err instanceof BlockNotFoundError) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t('This mermaid block could not be found — the document may have changed.'),
    );
    return;
  }
  if (err instanceof ExportFailedError) {
    outputChannel.appendLine(err.details || err.message);
    const viewLogs = vscode.l10n.t('View logs');
    const choice = await vscode.window.showErrorMessage(vscode.l10n.t('Export failed: {0}', err.message), viewLogs);
    if (choice === viewLogs) outputChannel.show();
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  outputChannel.appendLine(message);
  const viewLogs = vscode.l10n.t('View logs');
  const choice = await vscode.window.showErrorMessage(vscode.l10n.t('Export failed: {0}', message), viewLogs);
  if (choice === viewLogs) outputChannel.show();
}
