/**
 * Types of `@md2nativedocx/cli`'s library entry point (`convert.mjs`). Hand-written: the package is plain
 * JavaScript with no build step. Keep in step with `convert.mjs` and `envOptions.mjs`.
 */

/** Page and typography of the bundled reference document. Ignored under {@link ConvertOptions.referenceDoc}. */
export interface LayoutOptions {
  /** `A3`, `A4` (default), `Letter`, `Legal`… An unknown value falls back to A4. */
  pageSize?: string;
  /** `portrait` (default) or `landscape`. */
  orientation?: string;
  /** Word's presets: `normal` (default), `narrow`, `moderate`, `wide`. */
  margins?: string;
  /** Custom margins in centimetres; each side overrides the preset. */
  marginsCustomCm?: { top?: number; right?: number; bottom?: number; left?: number };
  headingFont?: string;
  bodyFont?: string;
  /** Body text size in points. */
  fontSizePt?: number;
  /** `single`, `1.15`, `1.5`, `double`; anything else keeps the template's spacing. */
  lineSpacing?: string;
  /** `both`, `right` or `center`; anything else leaves body text left-aligned. */
  justify?: string;
  /** Theme accent colour, `RRGGBB`. */
  accentColor?: string;
  /** Table header fill, `RRGGBB`. */
  tableHeaderColor?: string;
  /** A centred page number in the footer. */
  footerPageNumber?: boolean;
  /** Put each heading immediately followed by a table in its own landscape section. */
  landscapeTables?: boolean;
}

/** How {@link convert} builds the document. Every field is optional; the defaults match the CLI's. */
export interface ConvertOptions {
  /** Pandoc's working directory, against which relative image paths resolve. Default: `process.cwd()`. */
  cwd?: string;
  /** A `.docx` template to use instead of the bundled one (Pandoc's `--reference-doc`). Must exist. */
  referenceDoc?: string;
  layout?: LayoutOptions;
  /** A table of contents after the title, refreshed when Word opens the file. Default `false`. */
  toc?: boolean;
  /** Heading levels in the table of contents, 2 to 4. Default 3. */
  tocDepth?: number;
  /** Force a colour emoji font on emoji runs. Default `true`. */
  emojiFont?: boolean;
  /** SmartArt for the diagrams that can be one. Default `true`. */
  smartArt?: boolean;
  /** SmartArt look; unknown values fall back to `colorful`. */
  smartArtStyle?: string;
  /** Ship the pre-rendered SmartArt drawing, so Word and LibreOffice show the same geometry. Default `true`. */
  smartArtDrawing?: boolean;
  /** Native Word charts for `pie` / `xychart` / `radar`: `true` (default), `false`, or the types to chart. */
  nativeCharts?: boolean | readonly string[];
  /** Largest diagram width in EMU. Default: the page's usable width. */
  maxDrawingCx?: number;
  /** Largest diagram height in EMU. Default: the page's usable height. */
  maxDrawingCy?: number;
  /** Pandoc executable. Default `pandoc`, looked up on `PATH`. */
  pandocBin?: string;
  /** Node executable the Lua filter runs the diagram bridge with. Default: `process.execPath`. */
  nodeBin?: string;
}

/** A finished document. */
export interface ConvertResult {
  /** The `.docx` file's bytes. */
  document: Buffer;
  /** Non-fatal problems in the diagrams (syntax ignored, a SmartArt or chart drawn as shapes instead). */
  warnings: string[];
  /** Everything Pandoc and the filter wrote to stderr, for a log. */
  pandocStderr: string;
}

/** A conversion that produced no document. */
export declare class ConversionError extends Error {
  /** `setup`: filter or reference document · `pandoc`: Pandoc failed or is missing · `postprocess`. */
  readonly stage: 'setup' | 'pandoc' | 'postprocess';
  /** Pandoc's stderr, when it ran. */
  readonly pandocStderr: string;
}

/**
 * Convert a Markdown document to `.docx`: Pandoc with the md2nativedocx filter, every ```mermaid block as
 * editable Word shapes, SmartArt or a native chart. Needs Pandoc installed. Never reads `MD2NATIVEDOCX_*`
 * environment variables: behavior comes from `options` only.
 *
 * @param source Markdown text, or `{ path }` of a file for Pandoc to read (`.qmd` is read as Markdown).
 * @throws {ConversionError} when no document could be produced.
 */
export declare function convert(source: string | { path: string }, options?: ConvertOptions): Promise<ConvertResult>;
