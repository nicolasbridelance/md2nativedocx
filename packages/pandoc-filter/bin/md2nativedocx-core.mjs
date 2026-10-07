#!/usr/bin/env node
/**
 * Thin CLI bridge between the Pandoc Lua filter and the core engine.
 *
 * Reads Mermaid text (any of the 29 types) from a file path given as argv[1] (or stdin if
 * no argument), writes an OOXML/DrawingML `<w:p>` fragment to stdout. This
 * keeps the Lua filter free of any shell-string interpolation of diagram
 * text (AGENTS.md rule #4): the filter invokes this binary with a fixed
 * argument array and the diagram text lives in a temp file, never in a
 * shell string.
 *
 * Usage: md2nativedocx-core.mjs <diagram.mmd> > diagram.xml
 *
 * ## Adapter only (ADR 0012)
 *
 * Every rendering decision (diagram type, parser, SmartArt / native chart /
 * shapes, fallbacks) lives in `renderDiagram()` in `@md2nativedocx/core`.
 * This script only translates the environment into `RenderOptions` and the
 * `RenderResult` back into files and stderr lines:
 *
 *  - `MD2NATIVEDOCX_SMARTART_DIR` set turns SmartArt on; each SmartArt part
 *    set is written to `<dir>/<id>/` (`data.xml`, `layout.xml`, `colors.xml`,
 *    `quickStyle.xml`, `drawing.xml`). `MD2NATIVEDOCX_SMARTART_STYLE` picks
 *    the look, `MD2NATIVEDOCX_SMARTART_DRAWING=0` leaves the drawing out.
 *  - `MD2NATIVEDOCX_CHART_DIR` set turns native charts on, filtered by
 *    `MD2NATIVEDOCX_NATIVE_CHARTS` (unset or `1`: all, `0`: none, or a
 *    comma-separated list); each chart is written to `<dir>/<id>/`
 *    (`chart.xml`, `data.json`, `meta.json`).
 *  - `MD2NATIVEDOCX_MAX_DRAWING_CX`/`_CY` (EMU) set the usable page size
 *    (export_customization_SPEC.md §2.4); absent or unparseable keeps the
 *    Letter-portrait default.
 *
 * `packages/cli/src/postprocess.mjs` (`injectSmartArtParts`) and
 * `chartParts.mjs` pick those directories up after Pandoc and replace the
 * `SMARTART_PLACEHOLDER:<id>:…` / `CHART_PLACEHOLDER:<id>` relationship ids:
 * Pandoc's Lua filter API cannot add package parts itself (spec §2).
 *
 * ## Warnings (spec §10, "surface warnings")
 *
 * `RenderResult.metadata.warnings` are written to stderr as
 * `md2nativedocx: warning: <text>`. Pandoc's child-process stderr is
 * inherited by `packages/cli/bin/md2nativedocx.mjs`'s `execFile` call, which
 * counts `md2nativedocx: `-prefixed lines and surfaces them (CLI stdout
 * summary + a `.log` file next to the output; the VS Code extension turns
 * the count into a toast). A source that does not parse prints
 * `md2nativedocx: <message>` and exits 1.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { renderDiagram, buildDiagramTooLargeNoteXml, DiagramTooLargeError } from '@md2nativedocx/core';

const inputPath = process.argv[2];
const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');

/** A positive integer from the environment, or `undefined`. */
function positiveIntFromEnv(name) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** `MD2NATIVEDOCX_NATIVE_CHARTS`: unset or `1` enables every chart type, `0` none, a comma-separated list only those types. */
function nativeChartsFromEnv() {
  const value = (process.env.MD2NATIVEDOCX_NATIVE_CHARTS ?? '').trim();
  if (value === '' || value === '1') return true;
  if (value === '0') return false;
  return value.split(',').map((t) => t.trim());
}

const smartArtDir = process.env.MD2NATIVEDOCX_SMARTART_DIR;
const chartDir = process.env.MD2NATIVEDOCX_CHART_DIR;

/** @type {import('@md2nativedocx/core').RenderOptions} */
const options = {
  smartArt: Boolean(smartArtDir),
  smartArtStyle: process.env.MD2NATIVEDOCX_SMARTART_STYLE,
  smartArtDrawing: process.env.MD2NATIVEDOCX_SMARTART_DRAWING !== '0',
  nativeCharts: chartDir ? nativeChartsFromEnv() : false,
  newPartId: randomUUID,
};
const maxDrawingCx = positiveIntFromEnv('MD2NATIVEDOCX_MAX_DRAWING_CX');
const maxDrawingCy = positiveIntFromEnv('MD2NATIVEDOCX_MAX_DRAWING_CY');
if (maxDrawingCx !== undefined) options.maxDrawingCx = maxDrawingCx;
if (maxDrawingCy !== undefined) options.maxDrawingCy = maxDrawingCy;

/** Write one rendered part where the CLI's post-processing expects it. */
function writePart(part) {
  if (part.kind === 'smartart') {
    const dir = join(smartArtDir, part.id);
    mkdirSync(dir, { recursive: true });
    if (part.drawingXml !== undefined) writeFileSync(join(dir, 'drawing.xml'), part.drawingXml, 'utf8');
    writeFileSync(join(dir, 'data.xml'), part.dataXml, 'utf8');
    writeFileSync(join(dir, 'layout.xml'), part.layoutXml, 'utf8');
    writeFileSync(join(dir, 'colors.xml'), part.colorsXml, 'utf8');
    writeFileSync(join(dir, 'quickStyle.xml'), part.styleXml, 'utf8');
  } else {
    const dir = join(chartDir, part.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'chart.xml'), part.chartXml, 'utf8');
    writeFileSync(join(dir, 'data.json'), JSON.stringify(part.workbook), 'utf8');
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ hasWorkbook: part.hasWorkbook }), 'utf8');
  }
}

try {
  const result = renderDiagram(input, options);
  for (const warning of result.metadata.warnings) {
    process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
  }
  for (const part of result.parts) writePart(part);
  process.stdout.write(result.fragment);
} catch (err) {
  if (err instanceof DiagramTooLargeError) {
    // Deliberate fallback: an oversized diagram becomes a visible note, the rest of the document converts.
    process.stderr.write(`md2nativedocx: warning: ${err.message}\n`);
    process.stdout.write(buildDiagramTooLargeNoteXml(err));
    process.exit(0);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`md2nativedocx: ${message}\n`);
  process.exit(1);
}
