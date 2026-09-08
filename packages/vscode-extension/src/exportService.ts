import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { blockAtLine, parseMermaidBlocks, wrapBlockAsDocument, wrapMermaidSource, type MermaidBlock } from './mermaidBlocks';

export interface ExportResult {
  outputPath: string;
  /** Non-fatal warnings surfaced by this export (spec §10) — parser
   * warnings and SmartArt-fallback failures, read back from the `.log` file
   * `md2nativedocx.mjs` always writes next to `outputPath`. 0 when clean. */
  warningCount: number;
  /** Path to that `.log` file — same basename as `outputPath`, `.log`
   * extension. Always set; the caller can offer to open it when
   * `warningCount > 0`. */
  logPath: string;
}

/** Pandoc required to run the export but the CLI couldn't find any usable
 * binary. The optional `details` carries the real underlying reason (the
 * CLI's raw stderr — typically an `ENOENT`) so `extension.ts` can log it and
 * offer an actionable retry instead of a diagnostic black hole. */
export class PandocMissingError extends Error {
  constructor(
    message: string,
    public readonly details?: string,
  ) {
    super(message);
  }
}
/** Pandoc exists but its execution was blocked by a security policy
 * (AppLocker / WDAC / SmartScreen on a corporate machine — missing_pandoc_bugfix.md
 * §6). Distinguished from {@link PandocMissingError} because the cause and
 * the fix are completely different: retrying won't help, the user must
 * contact IT. Detected from the CLI's stderr/exit code rather than the
 * `ENOENT` substring that signals a genuinely missing binary. */
export class PandocBlockedByPolicyError extends Error {
  constructor(
    message: string,
    public readonly details?: string,
  ) {
    super(message);
  }
}
export class ExportFailedError extends Error {
  constructor(
    message: string,
    public readonly details: string,
  ) {
    super(message);
  }
}
/** Thrown when a palette-invoked block export no longer matches any block in
 * the document (it changed between CodeLens render and click). Distinguished
 * from the generic ExportFailedError so the caller (extension.ts, which has
 * vscode.l10n) can show a fully localized, fixed message instead of the raw
 * English fallback below — this module stays free of the `vscode` import on
 * purpose (see resolveCliBin), so it cannot call vscode.l10n.t() itself. */
export class BlockNotFoundError extends ExportFailedError {}

/** Resolve the real CLI's bin script (rule #4, AGENTS.md: fixed subprocess
 * argument array, no shell interpolation) — the extension bundles no logic
 * of its own, it packages the same `@md2nativedocx/cli` invocation used by
 * the tests and the corpus generator.
 *
 * A packaged .vsix ships a self-contained copy under dist/vendor/ (see
 * scripts/bundle-cli.mjs) — installed from the Marketplace, the extension
 * has no npm workspace around it, so `@md2nativedocx/cli` isn't on the
 * require path. The monorepo dev/test setup has no dist/vendor/, so it falls
 * back to resolving the workspace package directly. */
function resolveCliBin(): string {
  const vendored = join(__dirname, 'vendor', 'bin', 'md2nativedocx.mjs');
  if (existsSync(vendored)) {
    return vendored;
  }
  const pkgJsonPath = require.resolve('@md2nativedocx/cli/package.json');
  return join(dirname(pkgJsonPath), 'bin', 'md2nativedocx.mjs');
}

/** Resolve the vendored Word-compatibility validator DLL (ADR 0007 part D,
 * `scripts/bundle-oxml-validator.mjs`) — same dist/vendor-vs-monorepo
 * fallback shape as {@link resolveCliBin}. Returns `undefined` (not a
 * thrown error) when neither exists: the monorepo dev tree only has it
 * after running `npm run bundle` in `packages/vscode-extension` by hand
 * (unlike the CLI, which resolves straight to the workspace package without
 * needing a build step first) — callers must treat this the same as "the
 * check is unavailable right now" as any other provisioning failure, never
 * a hard error. */
export function resolveOxmlValidatorDll(): string | undefined {
  const vendored = join(__dirname, 'vendor', 'oxml-validator', 'oxmlvalidator.dll');
  return existsSync(vendored) ? vendored : undefined;
}

/** Page/typography options (`export_customization_SPEC.md` §1.1-1.8/1.14,
 * "Lot 1") mirroring the `md2nativedocx.layout.*`/`md2nativedocx.typography.*`
 * settings. Every field optional — an absent one leaves the corresponding
 * `reference.docx` patch untouched (`referenceDocBuilder.mjs`). Ignored
 * outright by the CLI when `referenceDoc` above is also set (spec §2.1,
 * option (a): a custom template's own page setup wins). */
export interface LayoutOptions {
  pageSize?: string;
  orientation?: string;
  margins?: string;
  marginsCustomTop?: number;
  marginsCustomRight?: number;
  marginsCustomBottom?: number;
  marginsCustomLeft?: number;
  headingFont?: string;
  bodyFont?: string;
  fontSize?: number;
  lineSpacing?: string;
  justify?: string;
  accentColor?: string;
  tableHeaderColor?: string;
  footerPageNumber?: boolean;
  /** Mirrors `md2nativedocx.layout.landscapeTables` (spec §1.9/§2.3, "Lot 5").
   * Grouped with the rest of Lot 1 (not TOC/emoji): the CLI needs the
   * document's actual page geometry to build a correct "return to portrait"
   * section, which isn't known for a custom `referenceDocument` either. */
  landscapeTables?: boolean;
}

export interface RunCliOptions {
  pandocBin?: string;
  /** Path to a `.docx` used as Pandoc's `--reference-doc` (mirrors the
   * `md2nativedocx.referenceDocument` setting) — a company/corporate
   * template instead of the bundled default. */
  referenceDoc?: string;
  /** Mirrors the `md2nativedocx.smartArt.enabled` setting. `true` opts an
   * eligible diagram into native SmartArt instead of the OOXML canvas
   * fallback every diagram otherwise gets. Omitted/`false` changes nothing
   * (the CLI's default, as of the 2026-09-03 flip — see
   * `md2nativedocx.mjs`'s doc comment on `smartArtEnabled`). */
  smartArtEnabled?: boolean;
  /** See {@link LayoutOptions}. */
  layout?: LayoutOptions;
  /** Mirrors `md2nativedocx.toc.enabled`. Unlike `layout`, this works even
   * when `referenceDoc` above is also set — TOC generation and the
   * auto-refresh-on-open patch both apply to Pandoc's own output
   * regardless of which reference doc it used (`md2nativedocx.mjs`'s doc
   * comment on `tocEnabled` has the empirical confirmation). */
  toc?: boolean;
  /** Mirrors `md2nativedocx.toc.depth` (2-4). Only meaningful when `toc` is
   * `true`. */
  tocDepth?: number;
  /** Mirrors `md2nativedocx.emoji.forceColorFont` (default `true` — only
   * `false` needs forwarding; the CLI's own default already matches `true`). */
  emojiFont?: boolean;
  /** `dotnet` executable to run the Word-compatibility check with (ADR 0007
   * part D) — resolved by `dotnetProvisioner.ts`, mirroring `pandocBin`
   * above. Omitted when `md2nativedocx.wordCompatibilityCheck.enabled` is
   * off or provisioning failed; the CLI simply skips the check then. */
  dotnetBin?: string;
  /** Path to the vendored `oxmlvalidator.dll` (see
   * `scripts/bundle-oxml-validator.mjs`) — the *presence* of this option is
   * what turns the check on at all, not just which `dotnet` runs it. */
  oxmlValidatorDll?: string;
}

/** Heuristic for "the binary exists but its execution was blocked by a
 * security policy" (missing_pandoc_bugfix.md §6), as opposed to a genuinely
 * missing binary (ENOENT, handled separately). Signals observed in the wild:
 * Windows exit code 1260 ("This program is blocked by group policy"), and
 * EACCES/EPERM in the error message (AppLocker/WDAC/SmartScreen). Kept as a
 * pure predicate so it's unit-testable without spawning a real process. */
function isBlockedByPolicy(err: { code?: string | number | null }, stderr: string): boolean {
  const code = typeof err.code === 'string' ? err.code : String(err.code ?? '');
  if (code === 'EACCES' || code === 'EPERM' || code === '1260') return true;
  return /1260|EACCES|EPERM|blocked by group policy/i.test(stderr);
}

function runCli(input: string, output: string, cwd: string, options: RunCliOptions = {}): Promise<void> {
  const cliBin = resolveCliBin();
  const env = { ...process.env };
  // Run the CLI with the editor's own bundled Node/Electron binary
  // (`process.execPath`) instead of a bare `node` resolved from the system
  // PATH. A locked-down corporate workstation with no dev tools installed
  // has no reason to have `node` on PATH at all — and when that spawn itself
  // fails, there's no child stderr to inspect (the process never started),
  // so it falls through to a bare, undiagnosable "spawn node ENOENT". VS
  // Code's own API docs recommend this exact pattern for running Node.js
  // scripts without depending on a system install (see `vscode.d.ts`'s
  // `McpStdioServerDefinition.command`). `ELECTRON_RUN_AS_NODE` is a no-op
  // when `process.execPath` already points at a plain Node binary.
  env.ELECTRON_RUN_AS_NODE = '1';
  if (options.pandocBin) env.MD2NATIVEDOCX_PANDOC_BIN = options.pandocBin;
  if (options.referenceDoc) env.MD2NATIVEDOCX_REFERENCE_DOC = options.referenceDoc;
  if (options.smartArtEnabled === true) env.MD2NATIVEDOCX_ENABLE_SMARTART = '1';
  const layout = options.layout;
  if (layout) {
    if (layout.pageSize) env.MD2NATIVEDOCX_PAGE_SIZE = layout.pageSize;
    if (layout.orientation) env.MD2NATIVEDOCX_ORIENTATION = layout.orientation;
    if (layout.margins) env.MD2NATIVEDOCX_MARGINS = layout.margins;
    if (layout.marginsCustomTop !== undefined) env.MD2NATIVEDOCX_MARGINS_CUSTOM_TOP = String(layout.marginsCustomTop);
    if (layout.marginsCustomRight !== undefined) env.MD2NATIVEDOCX_MARGINS_CUSTOM_RIGHT = String(layout.marginsCustomRight);
    if (layout.marginsCustomBottom !== undefined) env.MD2NATIVEDOCX_MARGINS_CUSTOM_BOTTOM = String(layout.marginsCustomBottom);
    if (layout.marginsCustomLeft !== undefined) env.MD2NATIVEDOCX_MARGINS_CUSTOM_LEFT = String(layout.marginsCustomLeft);
    if (layout.headingFont) env.MD2NATIVEDOCX_HEADING_FONT = layout.headingFont;
    if (layout.bodyFont) env.MD2NATIVEDOCX_BODY_FONT = layout.bodyFont;
    if (layout.fontSize !== undefined) env.MD2NATIVEDOCX_FONT_SIZE = String(layout.fontSize);
    if (layout.lineSpacing) env.MD2NATIVEDOCX_LINE_SPACING = layout.lineSpacing;
    if (layout.justify) env.MD2NATIVEDOCX_JUSTIFY = layout.justify;
    if (layout.accentColor) env.MD2NATIVEDOCX_ACCENT_COLOR = layout.accentColor;
    if (layout.tableHeaderColor) env.MD2NATIVEDOCX_TABLE_HEADER_COLOR = layout.tableHeaderColor;
    if (layout.footerPageNumber === true) env.MD2NATIVEDOCX_FOOTER_PAGE_NUMBER = '1';
    if (layout.landscapeTables === true) env.MD2NATIVEDOCX_LANDSCAPE_TABLES = '1';
  }
  if (options.toc === true) {
    env.MD2NATIVEDOCX_TOC = '1';
    if (options.tocDepth !== undefined) env.MD2NATIVEDOCX_TOC_DEPTH = String(options.tocDepth);
  }
  if (options.emojiFont === false) env.MD2NATIVEDOCX_EMOJI_FONT = '0';
  if (options.oxmlValidatorDll) {
    env.MD2NATIVEDOCX_OXML_VALIDATOR_DLL = options.oxmlValidatorDll;
    if (options.dotnetBin) env.MD2NATIVEDOCX_DOTNET_BIN = options.dotnetBin;
  }
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliBin, input, '-o', output], { cwd, encoding: 'utf8', env }, (err, _stdout, stderrRaw) => {
      if (!err) {
        resolve();
        return;
      }
      const stderr = String(stderrRaw ?? '');
      if (stderr.includes('ENOENT')) {
        // English fallback text — extension.ts shows its own localized string
        // for this specific, fixed-meaning error instead of err.message. The
        // full stderr is carried as `details` so the output channel can log
        // the real cause (missing binary, blocked by policy, ...) rather than
        // a diagnostic black hole.
        reject(new PandocMissingError('Pandoc could not be found on this machine.', stderr));
        return;
      }
      // A binary that exists but is blocked by a security policy (AppLocker /
      // WDAC / SmartScreen) fails with a different signal than ENOENT: on
      // Windows, exit code 1260 ("This program is blocked by group policy"),
      // or an EACCES/EPERM in the error message. Retrying won't help here —
      // the user must contact IT (missing_pandoc_bugfix.md §6).
      if (isBlockedByPolicy(err, stderr)) {
        reject(new PandocBlockedByPolicyError('Pandoc execution was blocked by a security policy.', stderr));
        return;
      }
      // The reason (raw Pandoc/CLI stderr) can't be translated — it's
      // external tool output. extension.ts prepends a localized "Export
      // failed: " prefix when displaying it.
      const firstLine = stderr.trim().split('\n')[0] || err.message;
      reject(new ExportFailedError(firstLine, stderr || err.message));
    });
  });
}

/** Path to the `.log` file `md2nativedocx.mjs` writes next to `output` —
 * same basename, `.log` extension, mirroring the CLI's own naming. */
function logPathFor(output: string): string {
  return output.toLowerCase().endsWith('.docx') ? `${output.slice(0, -'.docx'.length)}.log` : `${output}.log`;
}

/** Read back the warning count the CLI recorded in `output`'s `.log` file
 * (written on every successful export — see `md2nativedocx.mjs`). Returns 0
 * if the log is missing or unparseable rather than throwing: a missing log
 * must never turn a successful export into a reported failure. */
function readWarningCount(logPath: string): number {
  try {
    const content = readFileSync(logPath, 'utf8');
    const match = content.match(/^Warnings: (\d+)/m);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/** Where to write a generated `.docx`, honouring `md2nativedocx.outputDirectory`
 * (empty = same folder as the source, the zero-config default). */
export function resolveOutputPath(sourcePath: string, outputBaseName: string, outputDirectory: string): string {
  const dir = outputDirectory.trim() || dirname(sourcePath);
  return join(dir, `${outputBaseName}.docx`);
}

export async function exportDocument(
  sourcePath: string,
  outputDirectory: string,
  options: RunCliOptions = {},
): Promise<ExportResult> {
  const outputPath = resolveOutputPath(sourcePath, basename(sourcePath, '.md'), outputDirectory);
  await runCli(sourcePath, outputPath, dirname(sourcePath), options);
  const logPath = logPathFor(outputPath);
  return { outputPath, logPath, warningCount: readWarningCount(logPath) };
}

/** Export a single mermaid block by wrapping it in a minimal standalone
 * Markdown envelope (title + one ```mermaid block) — same shape as
 * `scripts/generate-corpus.mjs`'s `wrapMarkdown` — and running it through the
 * real CLI, so this exercises no logic the corpus tests don't already cover. */
export async function exportBlock(
  sourcePath: string,
  sourceText: string,
  blockIndex: number,
  outputDirectory: string,
  options: RunCliOptions = {},
): Promise<ExportResult> {
  const blocks = parseMermaidBlocks(sourceText);
  const block = blocks.find((b) => b.index === blockIndex);
  if (!block) {
    // English fallback text — extension.ts shows its own localized string
    // for this specific, fixed-meaning error instead of err.message.
    throw new BlockNotFoundError('This mermaid block could not be found — the document may have changed.', '');
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-block-'));
  try {
    const tmpMd = join(tmpDir, 'diagram.md');
    writeFileSync(tmpMd, wrapBlockAsDocument(block));
    const outputBaseName = `${basename(sourcePath, '.md')}-diagram-${blockIndex + 1}`;
    const outputPath = resolveOutputPath(sourcePath, outputBaseName, outputDirectory);
    await runCli(tmpMd, outputPath, dirname(sourcePath), options);
    const logPath = logPathFor(outputPath);
    return { outputPath, logPath, warningCount: readWarningCount(logPath) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Export a raw `.mmd` file (no fences of its own — the whole file *is* one
 * diagram) by wrapping it in the same minimal Markdown envelope
 * `exportBlock` uses, then running it through the real CLI. Mirrors
 * `exportBlock`'s temp-file approach. */
export async function exportMermaidFile(
  sourcePath: string,
  outputDirectory: string,
  options: RunCliOptions = {},
): Promise<ExportResult> {
  const source = readFileSync(sourcePath, 'utf8');
  const title = basename(sourcePath, '.mmd');
  const tmpDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-mmd-'));
  try {
    const tmpMd = join(tmpDir, 'diagram.md');
    writeFileSync(tmpMd, wrapMermaidSource(source, title));
    const outputPath = resolveOutputPath(sourcePath, title, outputDirectory);
    await runCli(tmpMd, outputPath, dirname(sourcePath), options);
    const logPath = logPathFor(outputPath);
    return { outputPath, logPath, warningCount: readWarningCount(logPath) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Resolve which block a palette-invoked (argument-less) export targets: the
 * block under the cursor if there is one, the sole block if there is exactly
 * one in the document, or `null` if the choice is ambiguous/absent — callers
 * decide how to prompt in that case (kept out of this pure-ish helper so it
 * stays unit-testable without a real editor). */
export function resolveBlockForCursor(sourceText: string, cursorLine: number): MermaidBlock | null {
  const blocks = parseMermaidBlocks(sourceText);
  const atCursor = blockAtLine(blocks, cursorLine);
  if (atCursor) return atCursor;
  return blocks.length === 1 ? (blocks[0] ?? null) : null;
}
