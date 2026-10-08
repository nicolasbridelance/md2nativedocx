/**
 * `convert()`: Markdown in, finished `.docx` (or `.odt`) bytes out (docs/specs/01-v2-engine-spec.md §6,
 * ADR 0012; `.odt`: ADR 0013).
 *
 * The library entry point of `@md2nativedocx/cli`, and what `bin/md2nativedocx.mjs` itself calls. It owns
 * the whole document path: reference document build, Pandoc with the Lua filter (which renders each
 * ```mermaid block through `renderDiagram()`), post-processing, SmartArt and chart part injection. It
 * lives here and not in `core` because it runs Pandoc (AGENTS.md: core knows nothing about Pandoc).
 *
 * Behavior comes from {@link ConvertOptions} only. Every inherited `MD2NATIVEDOCX_*` variable is removed
 * from the environment Pandoc and the filter see, then the ones the filter and the bridge read are set from
 * the options, so a host process's environment cannot change a conversion behind its caller's back. The
 * variables remain the CLI's interface (`envOptions.mjs` reads them).
 *
 * `format: 'odt'` hands Pandoc the derived `opendocument` template and the project's `reference.odt`
 * (`assets/`, built by `scripts/build-odt-assets.mjs`), and the filter draws each flowchart as native
 * ODF shapes. Nothing touches the `.odt` Pandoc writes (AGENTS.md rule 7). Page and typography options,
 * SmartArt, charts and the emoji font are `.docx` features and do not apply.
 *
 * Security (AGENTS.md): Pandoc runs through `execFile` with an argument array (rule 4); every file is written
 * in a fresh temporary directory removed afterwards; the post-processing is the rule 7 allowlist.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postProcessDocx, injectSmartArtParts } from './postprocess.mjs';
import { injectChartParts } from './chartParts.mjs';
import { buildReferenceDoc, resolveMaxDrawingExtentEmu, resolvePageSize, resolveMargins } from './referenceDocBuilder.mjs';

/** A conversion that produced no document. `stage` says where it stopped. */
export class ConversionError extends Error {
  /**
   * @param {string} message
   * @param {{ stage: 'setup' | 'pandoc' | 'postprocess', pandocStderr?: string, cause?: unknown }} details
   */
  constructor(message, { stage, pandocStderr = '', cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ConversionError';
    this.stage = stage;
    this.pandocStderr = pandocStderr;
  }
}

// Custom reference.docx (Word's current default look: Aptos font scheme, modern "Office" theme colors,
// non-bold flat heading hierarchy) instead of Pandoc's own bundled default, which is still the original
// 2007-2010 Office theme. See packages/cli/assets/README.md for how it was built and what it changes.
// `src/` and `bin/` are at the same depth, so this also holds in the VS Code extension's vendored bundle.
const DEFAULT_REFERENCE_DOC = fileURLToPath(new URL('../assets/reference.docx', import.meta.url));
// The `.odt` pair (ADR 0013): the project's own reference.odt (A4, 2.54 cm margins, diagram markers) and
// Pandoc's opendocument template plus the diagram-styles loop. See packages/cli/assets/README.md.
const DEFAULT_REFERENCE_ODT = fileURLToPath(new URL('../assets/reference.odt', import.meta.url));
const ODT_TEMPLATE = fileURLToPath(new URL('../assets/md2nativedocx.opendocument', import.meta.url));
/** 9 in in EMU: the `.docx` output's default drawing height (core's `MAX_DRAWING_CY`). */
const ODT_MAX_DRAWING_CY = 8229600;

/**
 * Where @md2nativedocx/pandoc-filter lands varies with how the CLI was deployed (npm workspace, nested or
 * flat install, the VS Code extension's vendored copy). import.meta.resolve() is Node's own resolution
 * algorithm, so it finds it in every case without guessing directory depths.
 */
function resolveFilterPath() {
  try {
    return fileURLToPath(import.meta.resolve('@md2nativedocx/pandoc-filter/md2nativedocx.lua'));
  } catch (err) {
    throw new ConversionError(`could not locate @md2nativedocx/pandoc-filter: ${errorMessage(err)}`, { stage: 'setup', cause: err });
  }
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** `MD2NATIVEDOCX_NATIVE_CHARTS` as the bridge reads it, or `null` for charts off. */
function nativeChartsEnv(setting) {
  if (setting === undefined || setting === true) return '1';
  if (setting === false || (Array.isArray(setting) && setting.length === 0)) return null;
  return setting.join(',');
}

/** The environment Pandoc runs with: the caller's, minus `MD2NATIVEDOCX_*`, plus what `options` says. */
function pandocEnvironment(options, { smartArtDir, chartDir, maxDrawingExtentEmu, landscapeGeometry }) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MD2NATIVEDOCX_')));
  if (smartArtDir) env.MD2NATIVEDOCX_SMARTART_DIR = smartArtDir;
  if (options.smartArtStyle !== undefined) env.MD2NATIVEDOCX_SMARTART_STYLE = options.smartArtStyle;
  if (options.smartArtDrawing === false) env.MD2NATIVEDOCX_SMARTART_DRAWING = '0';
  if (chartDir) {
    env.MD2NATIVEDOCX_CHART_DIR = chartDir;
    env.MD2NATIVEDOCX_NATIVE_CHARTS = nativeChartsEnv(options.nativeCharts);
  }
  // md2nativedocx.lua needs it on Windows (no shebang handling there, so it cannot run a bare .mjs). Our
  // own interpreter is always Node: a system Node, or the VS Code extension's Electron run as Node.
  env.MD2NATIVEDOCX_NODE_BIN = options.nodeBin ?? process.execPath;
  // An explicit drawing cap wins over the page-derived one (e.g. a diagram meant for a half-width cell).
  const cx = options.maxDrawingCx ?? (maxDrawingExtentEmu ? Math.round(maxDrawingExtentEmu.cx) : undefined);
  const cy = options.maxDrawingCy ?? (maxDrawingExtentEmu ? Math.round(maxDrawingExtentEmu.cy) : undefined);
  if (cx !== undefined) env.MD2NATIVEDOCX_MAX_DRAWING_CX = String(cx);
  if (cy !== undefined) env.MD2NATIVEDOCX_MAX_DRAWING_CY = String(cy);
  if (landscapeGeometry) {
    env.MD2NATIVEDOCX_LANDSCAPE_TABLES = '1';
    env.MD2NATIVEDOCX_PAGE_W_TWIPS = String(landscapeGeometry.pgSize.w);
    env.MD2NATIVEDOCX_PAGE_H_TWIPS = String(landscapeGeometry.pgSize.h);
    env.MD2NATIVEDOCX_MARGIN_TOP_TWIPS = String(landscapeGeometry.margins.top);
    env.MD2NATIVEDOCX_MARGIN_RIGHT_TWIPS = String(landscapeGeometry.margins.right);
    env.MD2NATIVEDOCX_MARGIN_BOTTOM_TWIPS = String(landscapeGeometry.margins.bottom);
    env.MD2NATIVEDOCX_MARGIN_LEFT_TWIPS = String(landscapeGeometry.margins.left);
  }
  return env;
}

function runPandoc(bin, args, { cwd, env }) {
  return new Promise((resolvePromise, reject) => {
    execFile(bin, args, { cwd, env, maxBuffer: 64 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new ConversionError(`Pandoc failed (exit ${err.code ?? '?'})`, { stage: 'pandoc', pandocStderr: stderr ?? '', cause: err }));
      } else {
        resolvePromise(stderr ?? '');
      }
    });
  });
}

/**
 * Lines this project wrote to stderr (`md2nativedocx: ...`: parser warnings, SmartArt or chart fallbacks,
 * from each bridge run the Lua filter spawned), without that prefix. Pandoc's own diagnostics share the
 * stream but are not ours to count.
 */
function extractWarnings(stderrText) {
  return stderrText
    .split('\n')
    .filter((line) => line.startsWith('md2nativedocx: ') && line.trim().length > 0)
    .map((line) => line.slice('md2nativedocx: '.length));
}

/** Where Pandoc reads from: the given file, or the text written to `work/input.md`. */
function inputFile(source, work) {
  if (typeof source !== 'string') return source.path;
  const inputPath = join(work, 'input.md');
  writeFileSync(inputPath, source, 'utf8');
  return inputPath;
}

/** Pandoc's reader and table-of-contents arguments, shared by both formats. */
function commonPandocArgs(inputPath, options) {
  const args = [];
  // Pandoc picks its reader from the extension and does not know `.qmd`; Quarto Markdown is Pandoc
  // Markdown plus front matter and code chunks, so naming the reader is correct and drops its warning.
  if (extname(inputPath).toLowerCase() === '.qmd') args.push('--from', 'markdown');
  const tocDepth = Math.min(4, Math.max(2, Math.round(options.tocDepth ?? 3)));
  if (options.toc) args.push('--toc', `--toc-depth=${tocDepth}`);
  return args;
}

/** The `.odt` path: Pandoc writes the whole package, nothing is done to it afterwards (rule 7). */
async function convertOdt(source, options) {
  const filterPath = resolveFilterPath();
  const cwd = options.cwd ?? process.cwd();
  const referenceDoc = options.referenceDoc ?? DEFAULT_REFERENCE_ODT;
  if (!existsSync(referenceDoc)) {
    throw new ConversionError(`reference document not found: ${referenceDoc}`, { stage: 'setup' });
  }
  if (extname(referenceDoc).toLowerCase() !== '.odt') {
    throw new ConversionError(`a .odt output needs a .odt reference document, got ${referenceDoc}`, { stage: 'setup' });
  }
  const work = mkdtempSync(join(tmpdir(), 'md2nativedocx-convert-'));
  try {
    const inputPath = inputFile(source, work);
    const outputPath = join(work, 'output.odt');
    const pandocArgs = [inputPath, '-o', outputPath, '--lua-filter', filterPath, '--template', ODT_TEMPLATE, '--reference-doc', referenceDoc];
    pandocArgs.push(...commonPandocArgs(inputPath, options));
    // Diagrams are scaled to fit the bundled reference.odt's text width (A4, 2.54 cm margins) and at most
    // 9 in high, the `.docx` default, which leaves room for a heading above a page-tall diagram instead of
    // pushing it alone onto the next page.
    const page = resolveMaxDrawingExtentEmu({ pageSize: 'A4' });
    const env = pandocEnvironment(
      { ...options, smartArtStyle: undefined, smartArtDrawing: undefined },
      { smartArtDir: null, chartDir: null, maxDrawingExtentEmu: { cx: page.cx, cy: Math.min(page.cy, ODT_MAX_DRAWING_CY) }, landscapeGeometry: null },
    );
    const pandocStderr = await runPandoc(options.pandocBin ?? 'pandoc', pandocArgs, { cwd, env });
    return { document: readFileSync(outputPath), warnings: extractWarnings(pandocStderr), pandocStderr };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Convert a Markdown document to `.docx`, or `.odt` with `format: 'odt'`. See `convert.d.mts` for the
 * option and result types.
 *
 * @param {string | { path: string }} source Markdown text, or a file for Pandoc to read (its extension picks
 *   the reader; `.qmd` is read as Markdown).
 * @param {import('./convert.d.mts').ConvertOptions} [options]
 * @returns {Promise<import('./convert.d.mts').ConvertResult>}
 */
export async function convert(source, options = {}) {
  const format = options.format ?? 'docx';
  if (format !== 'docx' && format !== 'odt') {
    throw new ConversionError(`unknown format ${JSON.stringify(format)}; expected "docx" or "odt"`, { stage: 'setup' });
  }
  if (format === 'odt') return convertOdt(source, options);
  const filterPath = resolveFilterPath();
  const cwd = options.cwd ?? process.cwd();
  const customReferenceDoc = options.referenceDoc;
  if (customReferenceDoc !== undefined && !existsSync(customReferenceDoc)) {
    throw new ConversionError(`reference document not found: ${customReferenceDoc}`, { stage: 'setup' });
  }
  // A custom reference document wins outright: its page setup is unknown, so page/typography options are
  // not patched into it (spec §2.1, option (a)).
  const layout = customReferenceDoc ? {} : (options.layout ?? {});

  const work = mkdtempSync(join(tmpdir(), 'md2nativedocx-convert-'));
  let generatedReferenceDoc = null;
  try {
    try {
      generatedReferenceDoc = customReferenceDoc ? null : buildReferenceDoc(DEFAULT_REFERENCE_DOC, layout);
    } catch (err) {
      throw new ConversionError(`reference document setup failed: ${errorMessage(err)}`, { stage: 'setup', cause: err });
    }
    const referenceDoc = customReferenceDoc ?? generatedReferenceDoc?.path ?? DEFAULT_REFERENCE_DOC;

    const inputPath = inputFile(source, work);
    const outputPath = join(work, 'output.docx');

    const pandocArgs = [inputPath, '-o', outputPath, '--lua-filter', filterPath];
    if (existsSync(referenceDoc)) pandocArgs.push('--reference-doc', referenceDoc);
    pandocArgs.push(...commonPandocArgs(inputPath, options));

    // The bridge (one run per ```mermaid block, spawned by the Lua filter) hands SmartArt and chart parts
    // back through these directories: a Lua filter cannot add package parts itself.
    const smartArtDir = options.smartArt !== false ? mkdtempSync(join(work, 'smartart-')) : null;
    const chartDir = nativeChartsEnv(options.nativeCharts) !== null ? mkdtempSync(join(work, 'chart-')) : null;
    const env = pandocEnvironment(options, {
      smartArtDir,
      chartDir,
      // Usable page area for the translator, whether or not the reference document needed a patch.
      maxDrawingExtentEmu: customReferenceDoc ? null : resolveMaxDrawingExtentEmu(layout),
      // The filter's "back to portrait" section needs the document's actual page geometry.
      landscapeGeometry: layout.landscapeTables
        ? { pgSize: resolvePageSize(layout.pageSize, layout.orientation), margins: resolveMargins(layout.margins, layout.marginsCustomCm) }
        : null,
    });

    const pandocStderr = await runPandoc(options.pandocBin ?? 'pandoc', pandocArgs, { cwd, env });

    try {
      // Namespaces and drawing ids first: the SmartArt and chart injection read the fixed document.xml.
      postProcessDocx(outputPath, { toc: Boolean(options.toc), emojiFont: options.emojiFont !== false });
      if (smartArtDir) injectSmartArtParts(outputPath, smartArtDir);
      if (chartDir) injectChartParts(outputPath, chartDir);
    } catch (err) {
      throw new ConversionError(`post-processing failed: ${errorMessage(err)}`, { stage: 'postprocess', pandocStderr, cause: err });
    }

    return { document: readFileSync(outputPath), warnings: extractWarnings(pandocStderr), pandocStderr };
  } finally {
    rmSync(work, { recursive: true, force: true });
    if (generatedReferenceDoc) rmSync(generatedReferenceDoc.dir, { recursive: true, force: true });
  }
}
