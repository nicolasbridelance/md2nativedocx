import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { MermaidCodeLensProvider } from './codeLensProvider';
import { registerStatusBar } from './statusBar';
import { parseMermaidBlocks, isExportablePath, isMermaidFilePath } from './mermaidBlocks';
import {
  exportDocument,
  exportBlock,
  exportMermaidFile,
  resolveBlockForCursor,
  PandocMissingError,
  BlockNotFoundError,
  ExportFailedError,
  type ExportResult,
} from './exportService';
import { ensurePandoc } from './pandocProvisioner';

let outputChannel: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  outputChannel = vscode.window.createOutputChannel('md2nativedocx');
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ pattern: '**/*.{md,mmd}' }, new MermaidCodeLensProvider()),
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

/** `md2nativedocx.referenceDocument` — mirrors Pandoc's own `--reference-doc`
 * (spec follow-up: "how does a user load their company's Word template").
 * Validated against the filesystem here (not in `exportService.ts`, which
 * stays free of any UI concern): an unreadable/misconfigured path must fall
 * back to the CLI's bundled default, not fail the export outright — same
 * "never leave the user worse off" rule `resolvePandocBin` already follows
 * for Pandoc provisioning. */
function referenceDocumentSetting(): string | undefined {
  const raw = vscode.workspace.getConfiguration('md2nativedocx').get<string>('referenceDocument', '').trim();
  if (!raw) return undefined;
  const resolved = resolveAgainstWorkspace(raw);
  if (!existsSync(resolved)) {
    outputChannel.appendLine(`md2nativedocx.referenceDocument is set to "${raw}" but that file could not be found — using the default template instead.`);
    return undefined;
  }
  return resolved;
}

/** `md2nativedocx.smartArt.enabled` — `false` (default, flipped 2026-09-03:
 * a real-Word test of `cycle.ts`'s output failed to open at all on the
 * simplest possible input, see `docs/markdown-mermaid-compliance-table.md` §2 point
 * 5) uses the OOXML canvas fallback for everything. `true` opts into an
 * eligible diagram (chain/tree/cycle shape) becoming a native SmartArt
 * graphic instead — until chain/tree/cycle are confirmed to open reliably in
 * real Word, treat this as experimental. */
function smartArtEnabledSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('smartArt.enabled', false);
}

function resolveAgainstWorkspace(rawPath: string): string {
  if (isAbsolute(rawPath)) return rawPath;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return folder ? join(folder, rawPath) : rawPath;
}

async function resolveExportableUri(uri: vscode.Uri | undefined): Promise<vscode.Uri | null> {
  if (uri) return uri;
  const active = vscode.window.activeTextEditor;
  if (active && isExportablePath(active.document.uri.fsPath)) return active.document.uri;
  void vscode.window.showErrorMessage(vscode.l10n.t('Open a Markdown (.md) or Mermaid (.mmd) file first.'));
  return null;
}

async function handleExportDocument(uriArg?: vscode.Uri): Promise<void> {
  const uri = await resolveExportableUri(uriArg);
  if (!uri) return;
  await runExportFlow(async (progress) => {
    const pandocBin = await resolvePandocBin(progress);
    const referenceDoc = referenceDocumentSetting();
    const smartArtEnabled = smartArtEnabledSetting();
    return isMermaidFilePath(uri.fsPath)
      ? exportMermaidFile(uri.fsPath, outputDirectorySetting(), { pandocBin, referenceDoc, smartArtEnabled })
      : exportDocument(uri.fsPath, outputDirectorySetting(), { pandocBin, referenceDoc, smartArtEnabled });
  });
}

async function handleExportBlock(uriArg?: vscode.Uri, blockIndexArg?: number): Promise<void> {
  const uri = await resolveExportableUri(uriArg);
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

  await runExportFlow(async (progress) => {
    const pandocBin = await resolvePandocBin(progress);
    const referenceDoc = referenceDocumentSetting();
    const smartArtEnabled = smartArtEnabledSetting();
    return exportBlock(uri.fsPath, text, blockIndex as number, outputDirectorySetting(), { pandocBin, referenceDoc, smartArtEnabled });
  });
}

/** Resolve a Pandoc binary via {@link ensurePandoc} (prefers `PATH`, else
 * downloads-and-caches the official release for this platform once — see
 * pandocProvisioner.ts), reporting progress into the export's own progress
 * toast. On any failure, log the reason and return `undefined` so the caller
 * falls back to today's behaviour (bare `pandoc` on `PATH`, surfacing the
 * existing `PandocMissingError` UX if that's also unavailable) — automatic
 * setup failing must never leave the user worse off than before it existed. */
async function resolvePandocBin(progress: vscode.Progress<{ message?: string }>): Promise<string | undefined> {
  try {
    return await ensurePandoc(extensionContext.globalStorageUri.fsPath, (event) => {
      if (event.phase === 'downloading') {
        progress.report({
          message: vscode.l10n.t('Setting up Pandoc (one-time download): {0}%', Math.round(event.fraction * 100)),
        });
      } else {
        progress.report({ message: vscode.l10n.t('Setting up Pandoc (one-time download)…') });
      }
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Automatic Pandoc setup failed, falling back to PATH: ${detail}`);
    return undefined;
  }
}

type ExportOutcome =
  | { ok: true; outputPath: string; warningCount: number; logPath: string }
  | { ok: false; error: unknown };

/** The 4-state export UX from docs/specs/UX_SPEC.md Partie 1: repos (nothing shown
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
async function runExportFlow(
  run: (progress: vscode.Progress<{ message?: string }>) => Promise<ExportResult>,
): Promise<void> {
  const outcome = await vscode.window.withProgress<ExportOutcome>(
    { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Export in progress'), cancellable: false },
    async (progress) => {
      try {
        const { outputPath, warningCount, logPath } = await run(progress);
        return { ok: true, outputPath, warningCount, logPath };
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
  const hasWarnings = outcome.warningCount > 0;
  const viewWarnings = vscode.l10n.t('View warnings');
  const message = hasWarnings
    ? vscode.l10n.t('Exported: {0} (with {1} warning(s))', basename(outcome.outputPath), outcome.warningCount)
    : vscode.l10n.t('Exported: {0}', basename(outcome.outputPath));
  const actions = hasWarnings ? [openInWord, revealInExplorer, viewWarnings] : [openInWord, revealInExplorer];
  const choice = hasWarnings
    ? await vscode.window.showWarningMessage(message, ...actions)
    : await vscode.window.showInformationMessage(message, ...actions);
  if (choice === openInWord) {
    await vscode.env.openExternal(vscode.Uri.file(outcome.outputPath));
  } else if (choice === revealInExplorer) {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outcome.outputPath));
  } else if (choice === viewWarnings) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(outcome.logPath));
    await vscode.window.showTextDocument(doc);
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
