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
  ExportFailedError,
} from './exportService';

const OPEN_IN_WORD = 'Ouvrir dans Word';
const REVEAL_IN_EXPLORER = "Révéler dans l'explorateur";
const INSTALL_PANDOC = 'Installer Pandoc';
const VIEW_LOGS = 'Voir les journaux';

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
  void vscode.window.showErrorMessage("Ouvrez d'abord un fichier Markdown (.md).");
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
        void vscode.window.showErrorMessage('Aucun diagramme mermaid trouvé dans ce document.');
        return;
      }
      const pick = await vscode.window.showQuickPick(
        blocks.map((b) => ({
          label: b.precedingHeading ?? `Diagramme ${b.index + 1}`,
          description: `ligne ${b.fenceLine + 1}`,
          block: b,
        })),
        { placeHolder: 'Quel diagramme exporter ?' },
      );
      if (!pick) return;
      blockIndex = pick.block.index;
    }
  }

  await runExportFlow(() => exportBlock(uri.fsPath, text, blockIndex as number, outputDirectorySetting()));
}

/** The 4-state export UX from UX_SPEC.md Partie 1: repos (nothing shown
 * until triggered) -> en cours (progress toast, never a silent freeze) ->
 * succès (actions that close the loop in one click) | erreur (explicit
 * message + a repair action, never a raw stack trace in the toast). */
async function runExportFlow(run: () => Promise<{ outputPath: string }>): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Export en cours', cancellable: false },
    async () => {
      try {
        const { outputPath } = await run();
        const choice = await vscode.window.showInformationMessage(
          `Exporté : ${basename(outputPath)}`,
          OPEN_IN_WORD,
          REVEAL_IN_EXPLORER,
        );
        if (choice === OPEN_IN_WORD) {
          await vscode.env.openExternal(vscode.Uri.file(outputPath));
        } else if (choice === REVEAL_IN_EXPLORER) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
        }
      } catch (err) {
        await handleExportError(err);
      }
    },
  );
}

async function handleExportError(err: unknown): Promise<void> {
  if (err instanceof PandocMissingError) {
    const choice = await vscode.window.showErrorMessage(err.message, INSTALL_PANDOC);
    if (choice === INSTALL_PANDOC) {
      await vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
    }
    return;
  }
  if (err instanceof ExportFailedError) {
    outputChannel.appendLine(err.details || err.message);
    const choice = await vscode.window.showErrorMessage(err.message, VIEW_LOGS);
    if (choice === VIEW_LOGS) outputChannel.show();
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  outputChannel.appendLine(message);
  const choice = await vscode.window.showErrorMessage(`Échec de l'export : ${message}`, VIEW_LOGS);
  if (choice === VIEW_LOGS) outputChannel.show();
}
