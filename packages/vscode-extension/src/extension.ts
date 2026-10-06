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
  resolveOxmlValidatorDll,
  PandocMissingError,
  PandocBlockedByPolicyError,
  BlockNotFoundError,
  ExportFailedError,
  type ExportFormat,
  type ExportResult,
  type LayoutOptions,
  type RunCliOptions,
  SMARTART_STYLE_NAMES,
  type SmartArtStyleName,
} from './exportService';
import { ensurePandoc } from './pandocProvisioner';
import { ensureDotnet } from './dotnetProvisioner';
import { ConfigPanelProvider, CONFIG_VIEW_ID } from './configPanel';

let outputChannel: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  outputChannel = vscode.window.createOutputChannel('md2nativedocx');
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ pattern: '**/*.{md,mmd,qmd}' }, new MermaidCodeLensProvider()),
    vscode.commands.registerCommand('md2nativedocx.exportDocument', (uri?: vscode.Uri, selection?: vscode.Uri[]) =>
      handleExportDocument(uri, selection, 'docx'),
    ),
    vscode.commands.registerCommand('md2nativedocx.exportDocumentPptx', (uri?: vscode.Uri, selection?: vscode.Uri[]) =>
      handleExportDocument(uri, selection, 'pptx'),
    ),
    vscode.commands.registerCommand('md2nativedocx.exportBlock', (uri?: vscode.Uri, blockIndex?: number) =>
      handleExportBlock(uri, blockIndex),
    ),
    vscode.commands.registerCommand('md2nativedocx.exportBlockDocx', (uri?: vscode.Uri) => handleExportBlock(uri, undefined, 'docx')),
    vscode.commands.registerCommand('md2nativedocx.exportBlockPptx', (uri?: vscode.Uri) => handleExportBlock(uri, undefined, 'pptx')),
    vscode.commands.registerCommand('md2nativedocx.openSettings', () =>
      vscode.commands.executeCommand(`${CONFIG_VIEW_ID}.focus`),
    ),
    vscode.window.registerWebviewViewProvider(CONFIG_VIEW_ID, new ConfigPanelProvider(context)),
  );

  registerStatusBar(context);
  trackCursorInBlock(context);
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

/** `md2nativedocx.smartArt.style` — look profile of the SmartArt diagrams (default `colorful`). */
function smartArtStyleSetting(): SmartArtStyleName {
  const value = vscode.workspace.getConfiguration('md2nativedocx').get<string>('smartArt.style', 'colorful');
  return (SMARTART_STYLE_NAMES as readonly string[]).includes(value) ? (value as SmartArtStyleName) : 'colorful';
}

/** `md2nativedocx.smartArt.preRenderedDrawing` — embed the cached `dsp:drawing` (default on). */
function smartArtDrawingSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('smartArt.preRenderedDrawing', true);
}

/** `md2nativedocx.nativeCharts.enabled` — `false` (default) keeps every `pie`/`xychart`/`radar` as editable
 * shapes. `true` opts into native Word charts with an embedded workbook (ADR 0011). */
function nativeChartsEnabledSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('nativeCharts.enabled', false);
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

/** `md2nativedocx.toc.enabled`/`md2nativedocx.toc.depth` (spec §1.10/§2.2,
 * "Lot 3"). Plain `.get()` (not `.inspect()`, unlike {@link layoutOptionsSetting})
 * is safe here: the schema default is `false`, so forwarding it changes
 * nothing for an untouched install — unlike a layout/typography default
 * (e.g. `A4`), which would silently activate page patching for everyone. */
function tocEnabledSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('toc.enabled', false);
}

function tocDepthSetting(): number {
  return vscode.workspace.getConfiguration('md2nativedocx').get<number>('toc.depth', 3);
}

/** `md2nativedocx.emoji.forceColorFont` (spec §1.15/§2.5, "Lot 2") — default
 * `true`, same safe-to-`.get()` reasoning as {@link tocEnabledSetting}: the
 * schema default matches the CLI's own default, so forwarding it changes
 * nothing for an untouched install. */
function emojiFontEnabledSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('emoji.forceColorFont', true);
}

/** `md2nativedocx.wordCompatibilityCheck.enabled` (ADR 0007 part D) — on by
 * default, costs one extra `dotnet` subprocess per export (auto-provisioned
 * on first use, same as Pandoc) in exchange for a schema-conformance report
 * in the `.log`; opt-out for anyone who'd rather skip that cost. */
function wordCompatibilityCheckEnabledSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('wordCompatibilityCheck.enabled', true);
}

/** Value the user actually configured for `md2nativedocx.<key>` at some
 * scope (workspace folder / workspace / user), or `undefined` if they never
 * touched it — as opposed to `.get()`, which always returns the
 * `package.json` schema default when nothing was set. The distinction
 * matters here: forwarding every Lot 1 layout/typography setting's *default*
 * value unconditionally would make every export rebuild `reference.docx`
 * with an explicit page format even for users who never opened these
 * settings, silently changing today's page-size behaviour (Word/Pandoc's
 * own default) for everyone. Only an explicit choice should trigger that. */
function explicitSetting<T>(config: vscode.WorkspaceConfiguration, key: string): T | undefined {
  const info = config.inspect<T>(key);
  if (!info) return undefined;
  return info.workspaceFolderValue ?? info.workspaceValue ?? info.globalValue;
}

/** `md2nativedocx.layout.*`/`md2nativedocx.typography.*` — Lot 1 page/
 * typography customization (`export_customization_SPEC.md` §1.1-1.8/1.14).
 * `undefined` when the user hasn't explicitly set any of them (see
 * {@link explicitSetting}), so a plain, untouched install behaves exactly as
 * before this feature existed. */
function layoutOptionsSetting(): LayoutOptions | undefined {
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  const trimmedOrUndefined = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
  const options: LayoutOptions = {
    pageSize: explicitSetting<string>(config, 'layout.pageSize'),
    orientation: explicitSetting<string>(config, 'layout.orientation'),
    margins: explicitSetting<string>(config, 'layout.margins'),
    marginsCustomTop: explicitSetting<number>(config, 'layout.marginsCustomTop'),
    marginsCustomRight: explicitSetting<number>(config, 'layout.marginsCustomRight'),
    marginsCustomBottom: explicitSetting<number>(config, 'layout.marginsCustomBottom'),
    marginsCustomLeft: explicitSetting<number>(config, 'layout.marginsCustomLeft'),
    headingFont: trimmedOrUndefined(explicitSetting<string>(config, 'typography.headingFont')),
    bodyFont: trimmedOrUndefined(explicitSetting<string>(config, 'typography.bodyFont')),
    fontSize: explicitSetting<number>(config, 'typography.fontSize'),
    lineSpacing: explicitSetting<string>(config, 'typography.lineSpacing'),
    justify: explicitSetting<string>(config, 'typography.justify'),
    accentColor: trimmedOrUndefined(explicitSetting<string>(config, 'typography.accentColor')),
    tableHeaderColor: trimmedOrUndefined(explicitSetting<string>(config, 'typography.tableHeaderColor')),
    footerPageNumber: explicitSetting<boolean>(config, 'layout.footerPageNumber'),
    landscapeTables: explicitSetting<boolean>(config, 'layout.landscapeTables'),
  };
  return Object.values(options).some((v) => v !== undefined) ? options : undefined;
}

/** Spec §2.1/§5, option (a): a custom `referenceDocument` wins outright over
 * Lot 1 layout/typography settings — its own page setup is unknown to us, so
 * patching it would be guesswork. The CLI already enforces this silently;
 * this only makes the precedence visible to a VS Code user who set both,
 * since the CLI's own info note (stderr) is never surfaced on a *successful*
 * export (`runCli` only reads stderr back on failure). */
function warnIfLayoutOptionsIgnored(referenceDoc: string | undefined, layout: LayoutOptions | undefined): void {
  if (referenceDoc && layout) {
    outputChannel.appendLine(
      'md2nativedocx.layout.*/typography.* settings are ignored for this export because md2nativedocx.referenceDocument is set — the custom template\'s own page setup is used instead.',
    );
  }
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
  void vscode.window.showErrorMessage(vscode.l10n.t('Open a Markdown (.md), Mermaid (.mmd) or Quarto (.qmd) file first.'));
  return null;
}

/** `md2nativedocx.pptx.showSource` — put each diagram's Mermaid source beside it on its slide. */
function pptxShowSourceSetting(): boolean {
  return vscode.workspace.getConfiguration('md2nativedocx').get<boolean>('pptx.showSource', false);
}

/**
 * Everything the CLI needs for one export in `format`. A PowerPoint deck needs no Pandoc and none of the
 * Word-only settings (template, page layout, SmartArt, Word compatibility check), so none is resolved for it.
 */
async function exportOptions(progress: vscode.Progress<{ message?: string }>, format: ExportFormat): Promise<RunCliOptions> {
  if (format === 'pptx') return { format, pptxShowSource: pptxShowSourceSetting() };
  const pandocBin = await resolvePandocBin(progress);
  const referenceDoc = referenceDocumentSetting();
  const layout = layoutOptionsSetting();
  warnIfLayoutOptionsIgnored(referenceDoc, layout);
  const wordCompatibilityCheck = await resolveWordCompatibilityCheck(progress);
  return {
    format,
    pandocBin,
    referenceDoc,
    smartArtEnabled: smartArtEnabledSetting(),
    nativeChartsEnabled: nativeChartsEnabledSetting(),
    smartArtStyle: smartArtStyleSetting(),
    smartArtDrawing: smartArtDrawingSetting(),
    layout,
    toc: tocEnabledSetting(),
    tocDepth: tocDepthSetting(),
    emojiFont: emojiFontEnabledSetting(),
    ...wordCompatibilityCheck,
  };
}

/** Export one document (`.md`/`.qmd`, or a raw `.mmd` diagram) in `format`. */
function exportOne(uri: vscode.Uri, options: RunCliOptions): Promise<ExportResult> {
  return isMermaidFilePath(uri.fsPath)
    ? exportMermaidFile(uri.fsPath, outputDirectorySetting(), options)
    : exportDocument(uri.fsPath, outputDirectorySetting(), options);
}

/**
 * "Exporter en Word" / "Exporter en PowerPoint" for a whole document. From the Explorer with several files
 * selected, VS Code passes the clicked file then the whole selection: each exportable file is exported.
 */
async function handleExportDocument(uriArg?: vscode.Uri, selection?: vscode.Uri[], format: ExportFormat = 'docx'): Promise<void> {
  const many = (selection ?? []).filter((u) => isExportablePath(u.fsPath));
  if (many.length > 1) {
    await handleExportMany(many, format);
    return;
  }
  const uri = await resolveExportableUri(uriArg);
  if (!uri) return;
  await runExportFlow(
    async (progress) => exportOne(uri, await exportOptions(progress, format)),
    format,
    // "Réessayer" on a Pandoc-missing toast must restart this exact command
    // with the same target URI (missing_pandoc_bugfix.md §4).
    () => handleExportDocument(uri, undefined, format),
  );
}

/** Several files selected in the Explorer: one progress notification, one summary at the end. */
async function handleExportMany(uris: vscode.Uri[], format: ExportFormat): Promise<void> {
  const failures: string[] = [];
  let lastOutput: string | undefined;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Export in progress'), cancellable: false },
    async (progress) => {
      for (const [i, uri] of uris.entries()) {
        progress.report({ message: `${i + 1}/${uris.length} — ${basename(uri.fsPath)}` });
        try {
          lastOutput = (await exportOne(uri, await exportOptions(progress, format))).outputPath;
        } catch (err) {
          const detail = err instanceof ExportFailedError ? err.details || err.message : err instanceof Error ? err.message : String(err);
          outputChannel.appendLine(`${uri.fsPath}: ${detail}`);
          failures.push(basename(uri.fsPath));
        }
      }
    },
  );
  const done = uris.length - failures.length;
  const revealInExplorer = vscode.l10n.t('Reveal in Explorer');
  const viewLogs = vscode.l10n.t('View logs');
  if (failures.length === 0) {
    const choice = await vscode.window.showInformationMessage(vscode.l10n.t('Exported {0} files', done), revealInExplorer);
    if (choice === revealInExplorer && lastOutput) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(lastOutput));
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t('Exported {0} of {1} files; failed: {2}', done, uris.length, failures.join(', ')),
    viewLogs,
  );
  if (choice === viewLogs) outputChannel.show();
}

/** Ask Word or PowerPoint (used by "Exporter ce diagramme…"). `undefined` if dismissed. */
async function pickFormat(): Promise<ExportFormat | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: `$(file) ${vscode.l10n.t('Word (.docx)')}`, format: 'docx' as const },
      { label: `$(preview) ${vscode.l10n.t('PowerPoint (.pptx), one slide')}`, format: 'pptx' as const },
    ],
    { placeHolder: vscode.l10n.t('Export this diagram to…') },
  );
  return pick?.format;
}

/**
 * "Exporter ce diagramme…": one diagram, into its own `.docx` or one-slide `.pptx`. `format` comes from a
 * direct menu entry; without it (CodeLens, palette) the user picks.
 */
async function handleExportBlock(uriArg?: vscode.Uri, blockIndexArg?: number, formatArg?: ExportFormat): Promise<void> {
  const uri = await resolveExportableUri(uriArg);
  if (!uri) return;

  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  let blockIndex = blockIndexArg;

  if (blockIndex === undefined) {
    // Invoked from the Command Palette or the editor menu (no CodeLens argument): the block under the
    // cursor, the sole block if unambiguous, or a picker.
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

  const format = formatArg ?? (await pickFormat());
  if (!format) return;
  await runExportFlow(
    async (progress) => exportBlock(uri.fsPath, text, blockIndex as number, outputDirectorySetting(), await exportOptions(progress, format)),
    format,
    // "Réessayer" on a Pandoc-missing toast must restart this exact command
    // with the same target URI + block index (missing_pandoc_bugfix.md §4).
    () => handleExportBlock(uri, blockIndex, format),
  );
}

/** Keeps `md2nativedocx.cursorInMermaidBlock` up to date, for the editor right-click "this diagram" entries. */
function trackCursorInBlock(context: vscode.ExtensionContext): void {
  const update = (editor: vscode.TextEditor | undefined) => {
    const inBlock =
      editor !== undefined &&
      isExportablePath(editor.document.uri.fsPath) &&
      !isMermaidFilePath(editor.document.uri.fsPath) &&
      parseMermaidBlocks(editor.document.getText()).some(
        (b) => editor.selection.active.line >= b.fenceLine && editor.selection.active.line <= b.closingFenceLine,
      );
    void vscode.commands.executeCommand('setContext', 'md2nativedocx.cursorInMermaidBlock', inBlock);
  };
  update(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.window.onDidChangeTextEditorSelection((e) => update(e.textEditor)),
  );
}

/** Resolve `md2nativedocx.pandoc.downloadUrl`/`.sha256` into the mirror
 * override passed to {@link ensurePandoc} (missing_pandoc_bugfix.md §7 — lets
 * an IT department mirror Pandoc internally for a firewalled network). Both
 * fields must be set together; `pandocProvisioner.ts` rejects `downloadUrl`
 * that isn't `https://` and still mandates the hash — this only relocates
 * *where* the archive is fetched from, never removes the integrity check. */
function pandocDownloadOverrideSetting(): { downloadUrl: string; sha256: string } | undefined {
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  const url = config.get<string>('pandoc.downloadUrl', '').trim();
  const sha256 = config.get<string>('pandoc.sha256', '').trim();
  if (!url && !sha256) return undefined;
  if (!url || !sha256) {
    outputChannel.appendLine(
      'md2nativedocx.pandoc.downloadUrl and md2nativedocx.pandoc.sha256 must both be set to use an internal mirror — ignoring the half-configured override.',
    );
    return undefined;
  }
  return { downloadUrl: url, sha256 };
}

/** Resolve `mdOrDotnet.downloadUrl`/`.sha512` into the override for
 * {@link ensureDotnet} — same purpose and same mandatory-hash rule as
 * {@link pandocDownloadOverrideSetting} (missing_pandoc_bugfix.md §7). */
function dotnetDownloadOverrideSetting(): { downloadUrl: string; sha512: string } | undefined {
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  const url = config.get<string>('dotnet.downloadUrl', '').trim();
  const sha512 = config.get<string>('dotnet.sha512', '').trim();
  if (!url && !sha512) return undefined;
  if (!url || !sha512) {
    outputChannel.appendLine(
      'md2nativedocx.dotnet.downloadUrl and md2nativedocx.dotnet.sha512 must both be set to use an internal mirror — ignoring the half-configured override.',
    );
    return undefined;
  }
  return { downloadUrl: url, sha512 };
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
    }, pandocDownloadOverrideSetting());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Automatic Pandoc setup failed, falling back to PATH: ${detail}`);
    return undefined;
  }
}

/** Resolve `{ dotnetBin, oxmlValidatorDll }` for the Word-compatibility
 * check (ADR 0007 part D), or `undefined` when the setting is off, the
 * vendored DLL isn't present (e.g. a monorepo dev build that never ran
 * `npm run bundle`), or provisioning `dotnet` fails — same
 * "never leave the user worse off than before it existed" rule as
 * {@link resolvePandocBin}: any failure here just means the `.log`'s
 * compatibility section says "not checked", never a failed export. */
async function resolveWordCompatibilityCheck(
  progress: vscode.Progress<{ message?: string }>,
): Promise<{ dotnetBin: string; oxmlValidatorDll: string } | undefined> {
  if (!wordCompatibilityCheckEnabledSetting()) return undefined;
  const oxmlValidatorDll = resolveOxmlValidatorDll();
  if (!oxmlValidatorDll) return undefined;
  try {
    const dotnetBin = await ensureDotnet(extensionContext.globalStorageUri.fsPath, (event) => {
      if (event.phase === 'downloading') {
        progress.report({
          message: vscode.l10n.t('Setting up .NET for the Word compatibility check (one-time download): {0}%', Math.round(event.fraction * 100)),
        });
      } else {
        progress.report({ message: vscode.l10n.t('Setting up .NET for the Word compatibility check (one-time download)…') });
      }
    }, dotnetDownloadOverrideSetting());
    return { dotnetBin, oxmlValidatorDll };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Word compatibility check unavailable this export: ${detail}`);
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
  format: ExportFormat,
  retry?: () => Promise<void>,
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
    await handleExportError(outcome.error, retry);
    return;
  }

  const openInWord = format === 'pptx' ? vscode.l10n.t('Open in PowerPoint') : vscode.l10n.t('Open in Word');
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

async function handleExportError(err: unknown, retry?: () => Promise<void>): Promise<void> {
  if (err instanceof PandocMissingError) {
    // Always log the real reason before the toast — otherwise the output
    // channel stays empty and the cause becomes a diagnostic black hole
    // (missing_pandoc_bugfix.md §3).
    outputChannel.appendLine(err.details || err.message);
    const retryAction = vscode.l10n.t('Retry (automatic install)');
    const installManually = vscode.l10n.t('Install manually (requires admin rights)');
    const choice = await vscode.window.showErrorMessage(
      vscode.l10n.t('Pandoc could not be found on this machine.'),
      retryAction,
      installManually,
    );
    if (choice === retryAction && retry) {
      // Re-runs the exact export command (document or block) that failed,
      // which re-invokes resolvePandocBin() -> ensurePandoc() from scratch —
      // the no-elevation auto-provisioning path, unlike the manual install
      // link below (missing_pandoc_bugfix.md §4).
      await retry();
    } else if (choice === installManually) {
      await vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
    }
    return;
  }
  if (err instanceof PandocBlockedByPolicyError) {
    // Cause and fix differ fundamentally from a missing binary: retrying
    // won't help until IT changes the policy, so no "retry" action — only
    // "copy the technical details" to paste into a support ticket
    // (missing_pandoc_bugfix.md §6).
    outputChannel.appendLine(err.details || err.message);
    const copyDetails = vscode.l10n.t('Copy technical details');
    const choice = await vscode.window.showErrorMessage(
      vscode.l10n.t(
        "Pandoc execution was blocked by your machine's security policy (AppLocker/SmartScreen). Contact your IT support to request an exception.",
      ),
      copyDetails,
    );
    if (choice === copyDetails) {
      await vscode.env.clipboard.writeText(`${err.details || err.message}\n\n${err.stack || ''}`);
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
