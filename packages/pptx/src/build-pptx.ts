/**
 * Slide layout + OPC assembly: turns converted diagram fragments into a `.pptx` buffer.
 */

import AdmZip from 'adm-zip';
import { escapeXml } from '@md2nativedocx/core';
import { type ConvertedFragment, convertFragment } from './fragment-converter.js';
import {
  PRES_PROPS_XML,
  ROOT_RELS_XML,
  SLIDE_HEIGHT,
  SLIDE_LAYOUT_RELS_XML,
  SLIDE_LAYOUT_XML,
  SLIDE_MASTER_RELS_XML,
  SLIDE_MASTER_XML,
  SLIDE_RELS_XML,
  SLIDE_WIDTH,
  TABLE_STYLES_XML,
  THEME_XML,
  VIEW_PROPS_XML,
  appXml,
  contentTypesXml,
  coreXml,
  presentationRelsXml,
  presentationXml,
  slideXml,
} from './package-parts.js';

const MARGIN = 457200; // 0.5 in
const TITLE_Y = 228600;
const TITLE_HEIGHT = 685800;
const TITLE_ID = 2;
const NOTES_ID = 3;
const SOURCE_ID = 4;
const NOTES_HEIGHT = 342900;
/** Diagrams are enlarged to fill the slide, but never beyond this factor (tiny diagrams would look absurd). */
const MAX_UPSCALE = 2.5;

/** Area, in EMU, available to a diagram once the title band is accounted for. */
export interface DiagramArea {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

/** Share of the slide width given to the Mermaid source panel when it is shown. */
const SOURCE_WIDTH_FRACTION = 0.36;
const SOURCE_GAP = 182880; // 0.2 in between diagram and panel

/** The diagram area of a slide, with or without a title band above it and a source panel beside it. */
export function diagramAreaFor(hasTitle: boolean, hasNotes: boolean, hasSource = false): DiagramArea {
  const top = hasTitle ? TITLE_Y + TITLE_HEIGHT + 114300 : MARGIN;
  const bottom = SLIDE_HEIGHT - MARGIN - (hasNotes ? NOTES_HEIGHT : 0);
  const full = SLIDE_WIDTH - 2 * MARGIN;
  const cx = hasSource ? full - Math.round(full * SOURCE_WIDTH_FRACTION) - SOURCE_GAP : full;
  return { x: MARGIN, y: top, cx, cy: bottom - top };
}

/** One slide's worth of input: a core-generated fragment (`<w:p>` XML) plus an optional title. */
export interface SlideInput {
  /** The `<w:p>` drawing fragment emitted by a core translator for one Mermaid block. */
  fragmentXml: string;
  /** Slide title (plain text, escaped here). */
  title?: string;
  /** Mermaid source to show in a panel beside the diagram (plain text, escaped here). */
  source?: string;
}

/** Output of {@link buildPptx}. */
export interface BuiltPptx {
  /** The complete `.pptx` file. */
  buffer: Buffer;
  /** Conversion warnings, deduplicated across slides. */
  warnings: string[];
}

function textBox(id: number, name: string, box: DiagramArea, paragraphs: string, anchor: 'ctr' | 't'): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    `<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="${anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  );
}

/**
 * Largest font size (1/100 pt, 6-14 pt) at which the source lines, wrapped to the panel width,
 * still fit its height. Monospace glyphs are about 0.6 em wide, lines 1.25 em tall.
 */
function sourceFontSize(lines: string[], box: DiagramArea): number {
  const EMU_PER_PT = 12700;
  const widthPt = (box.cx - 2 * 91440) / EMU_PER_PT;
  const heightPt = (box.cy - 2 * 45720) / EMU_PER_PT;
  for (let size = 14; size > 6; size -= 0.5) {
    const charsPerLine = Math.max(1, Math.floor(widthPt / (size * 0.6)));
    const rows = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
    if (rows * size * 1.25 <= heightPt) return Math.round(size * 100);
  }
  return 600;
}

/** The Mermaid source as a gray panel of monospace text, one paragraph per source line. */
function sourcePanel(source: string, box: DiagramArea): string {
  const lines = source.replace(/\t/g, '    ').split(/\r?\n/);
  const sz = sourceFontSize(lines, box);
  const font = '<a:latin typeface="Consolas"/><a:cs typeface="Consolas"/>';
  const color = '<a:solidFill><a:srgbClr val="1F2937"/></a:solidFill>';
  const paragraphs = lines
    .map((line) =>
      line === ''
        ? `<a:p><a:endParaRPr lang="en-US" sz="${sz}" dirty="0"/></a:p>`
        : `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="${sz}" dirty="0">${color}${font}</a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
    )
    .join('');
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${SOURCE_ID}" name="Mermaid source"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F3F4F6"/></a:solidFill>' +
    '<a:ln w="9525"><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill></a:ln></p:spPr>' +
    `<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  );
}

function titleShape(title: string): string {
  const run = `<a:r><a:rPr lang="en-US" sz="2800" b="1" dirty="0"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill></a:rPr><a:t>${escapeXml(title)}</a:t></a:r>`;
  return textBox(
    TITLE_ID,
    'Title',
    { x: MARGIN, y: TITLE_Y, cx: SLIDE_WIDTH - 2 * MARGIN, cy: TITLE_HEIGHT },
    `<a:p><a:pPr algn="l"/>${run}</a:p>`,
    'ctr',
  );
}

function buildSlide(input: SlideInput, warnings: Set<string>): string {
  const hasTitle = input.title !== undefined && input.title !== '';
  // First pass measures the drawing and any notes; the area then decides scale and offset.
  const probe: ConvertedFragment = convertFragment(input.fragmentXml, { x: 0, y: 0 });
  const hasNotes = probe.notesXml.length > 0;
  const hasSource = input.source !== undefined && input.source !== '';
  const area = diagramAreaFor(hasTitle, hasNotes, hasSource);
  const fit =
    probe.extent.cx > 0 && probe.extent.cy > 0
      ? Math.min(area.cx / probe.extent.cx, area.cy / probe.extent.cy)
      : 1;
  const scale = Math.min(MAX_UPSCALE, fit);
  const placed = convertFragment(input.fragmentXml, {
    scale,
    x: area.x + (area.cx - probe.extent.cx * scale) / 2,
    y: area.y + (area.cy - probe.extent.cy * scale) / 2,
  });
  for (const w of placed.warnings) warnings.add(w);
  const parts: string[] = [];
  if (hasTitle) parts.push(titleShape(input.title ?? ''));
  parts.push(...placed.shapesXml);
  if (hasSource) {
    const full = SLIDE_WIDTH - 2 * MARGIN;
    const panelCx = Math.round(full * SOURCE_WIDTH_FRACTION);
    parts.push(sourcePanel(input.source ?? '', { x: SLIDE_WIDTH - MARGIN - panelCx, y: area.y, cx: panelCx, cy: area.cy }));
  }
  if (hasNotes) {
    parts.push(
      textBox(
        Math.max(NOTES_ID, placed.maxId + 1),
        'Notes',
        { x: MARGIN, y: SLIDE_HEIGHT - MARGIN - NOTES_HEIGHT, cx: SLIDE_WIDTH - 2 * MARGIN, cy: NOTES_HEIGHT },
        placed.notesXml.join(''),
        't',
      ),
    );
  }
  return slideXml(parts.join(''));
}

/**
 * Assemble a `.pptx` (one 16:9 slide per input).
 *
 * @param slides - Diagram fragments, in slide order.
 * @param options - `title` is the document title; `now` fixes the timestamp (tests).
 */
export function buildPptx(slides: SlideInput[], options: { title?: string; now?: Date } = {}): BuiltPptx {
  const warnings = new Set<string>();
  const slideParts = slides.map((s) => buildSlide(s, warnings));
  const iso = (options.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const zip = new AdmZip();
  const add = (name: string, content: string): void => void zip.addFile(name, Buffer.from(content, 'utf8'));
  add('[Content_Types].xml', contentTypesXml(slides.length));
  add('_rels/.rels', ROOT_RELS_XML);
  add('docProps/core.xml', coreXml(options.title ?? 'md2nativedocx', iso));
  add('docProps/app.xml', appXml(slides.length));
  add('ppt/presentation.xml', presentationXml(slides.length));
  add('ppt/_rels/presentation.xml.rels', presentationRelsXml(slides.length));
  add('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER_XML);
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', SLIDE_MASTER_RELS_XML);
  add('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT_XML);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', SLIDE_LAYOUT_RELS_XML);
  add('ppt/theme/theme1.xml', THEME_XML);
  add('ppt/presProps.xml', PRES_PROPS_XML);
  add('ppt/viewProps.xml', VIEW_PROPS_XML);
  add('ppt/tableStyles.xml', TABLE_STYLES_XML);
  slideParts.forEach((xml, i) => {
    add(`ppt/slides/slide${i + 1}.xml`, xml);
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, SLIDE_RELS_XML);
  });
  return { buffer: zip.toBuffer(), warnings: [...warnings] };
}
