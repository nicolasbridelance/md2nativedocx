/**
 * The `MD2NATIVEDOCX_*` environment variables, read into {@link convert}'s typed options.
 *
 * The variables stay the CLI's configuration interface: the VS Code extension's `exportService.ts` sets
 * them from its settings, and a standalone user can set them by hand. Only this adapter reads them
 * (docs/specs/01-v2-engine-spec.md §8); `convert()` itself never looks at the environment.
 *
 * Variables the CLI sets for the Lua filter and the bridge (`_SMARTART_DIR`, `_CHART_DIR`, `_NODE_BIN`,
 * `_PAGE_*_TWIPS`, `_MARGIN_*_TWIPS`) are not inputs and are not read here.
 */

import { existsSync } from 'node:fs';

/** Whether any page/typography option is set (they are ignored under a custom reference document). */
export function hasLayoutOptions(layout) {
  return Object.values(layout ?? {}).some((v) => v !== undefined);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {import('./convert.d.mts').ConvertOptions}
 */
export function readConvertOptionsFromEnv(env) {
  const str = (name) => {
    const v = env[name];
    return v && v.trim() !== '' ? v.trim() : undefined;
  };
  const num = (name) => {
    const v = env[name];
    if (v === undefined || v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const positiveInt = (name) => {
    const n = Number.parseInt(env[name] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const marginsCustomCm = {
    top: num('MD2NATIVEDOCX_MARGINS_CUSTOM_TOP'),
    right: num('MD2NATIVEDOCX_MARGINS_CUSTOM_RIGHT'),
    bottom: num('MD2NATIVEDOCX_MARGINS_CUSTOM_BOTTOM'),
    left: num('MD2NATIVEDOCX_MARGINS_CUSTOM_LEFT'),
  };
  const layout = {
    pageSize: str('MD2NATIVEDOCX_PAGE_SIZE'),
    orientation: str('MD2NATIVEDOCX_ORIENTATION'),
    margins: str('MD2NATIVEDOCX_MARGINS'),
    marginsCustomCm: Object.values(marginsCustomCm).some((v) => v !== undefined) ? marginsCustomCm : undefined,
    headingFont: str('MD2NATIVEDOCX_HEADING_FONT'),
    bodyFont: str('MD2NATIVEDOCX_BODY_FONT'),
    fontSizePt: num('MD2NATIVEDOCX_FONT_SIZE'),
    lineSpacing: str('MD2NATIVEDOCX_LINE_SPACING'),
    justify: str('MD2NATIVEDOCX_JUSTIFY'),
    accentColor: str('MD2NATIVEDOCX_ACCENT_COLOR'),
    tableHeaderColor: str('MD2NATIVEDOCX_TABLE_HEADER_COLOR'),
    footerPageNumber: env.MD2NATIVEDOCX_FOOTER_PAGE_NUMBER === '1' ? true : undefined,
    landscapeTables: env.MD2NATIVEDOCX_LANDSCAPE_TABLES === '1' ? true : undefined,
  };

  // Unset or `1`: every chartable type; `0`: none; otherwise a comma-separated list of types.
  const chartsRaw = (env.MD2NATIVEDOCX_NATIVE_CHARTS ?? '').trim();
  const nativeCharts = chartsRaw === '' || chartsRaw === '1' ? true : chartsRaw === '0' ? false : chartsRaw.split(',').map((t) => t.trim());

  const tocDepth = Number(env.MD2NATIVEDOCX_TOC_DEPTH);
  // A reference document that does not exist is ignored (the bundled one is used), as it always was.
  const referenceDoc = env.MD2NATIVEDOCX_REFERENCE_DOC && existsSync(env.MD2NATIVEDOCX_REFERENCE_DOC) ? env.MD2NATIVEDOCX_REFERENCE_DOC : undefined;

  /** @type {import('./convert.d.mts').ConvertOptions} */
  const options = {
    layout,
    toc: env.MD2NATIVEDOCX_TOC === '1',
    emojiFont: env.MD2NATIVEDOCX_EMOJI_FONT !== '0',
    // SmartArt and native charts are on by default, as in the VS Code extension; `0` turns them off.
    smartArt: env.MD2NATIVEDOCX_ENABLE_SMARTART !== '0',
    smartArtDrawing: env.MD2NATIVEDOCX_SMARTART_DRAWING !== '0',
    nativeCharts,
  };
  if (Number.isFinite(tocDepth)) options.tocDepth = tocDepth;
  if (referenceDoc) options.referenceDoc = referenceDoc;
  if (env.MD2NATIVEDOCX_SMARTART_STYLE !== undefined) options.smartArtStyle = env.MD2NATIVEDOCX_SMARTART_STYLE;
  const maxDrawingCx = positiveInt('MD2NATIVEDOCX_MAX_DRAWING_CX');
  const maxDrawingCy = positiveInt('MD2NATIVEDOCX_MAX_DRAWING_CY');
  if (maxDrawingCx !== undefined) options.maxDrawingCx = maxDrawingCx;
  if (maxDrawingCy !== undefined) options.maxDrawingCy = maxDrawingCy;
  if (env.MD2NATIVEDOCX_PANDOC_BIN) options.pandocBin = env.MD2NATIVEDOCX_PANDOC_BIN;
  return options;
}
