/**
 * OOXML translator for a Mermaid `eventmodeling` diagram. Family D strategy
 * (calculated shapes on a `wpc:wpc` canvas): one column per frame in source
 * order, swimlanes per (namespace, lane group) with the three standard groups
 * UI/Automation on top, Command/Read Model in the middle and Events at the
 * bottom, color-coded cards (UI white, command blue, event orange, read model
 * green, processor gray), arrows from each source frame (explicit `->>`, or
 * the previous frame when none is given and the frame is not a reset frame),
 * data text under the name, notes under the card and a scenario list at the
 * bottom. Differences from Mermaid: lanes are ordered by group first and by
 * first appearance within a group; data is shown as truncated plain text;
 * `config` / theme styling is ignored.
 */

import type { EventModelingDiagram, EventModelingFrame, EventModelingKind, EventModelingStatement } from './types.js';
import { boxShape, fitFont, noteParagraph, scalePt, wrapText } from '../../translator/boxes.js';
import { createIdAllocator, scaledExtent, scaledLineWidthEmu, wrapDrawingCanvas } from '../../translator/canvas.js';
import { connector, edgePoint, rect } from '../../translator/graph-shapes.js';

const LABEL_W = 120;
const COL_W = 150;
const CARD_W = 128;
const PAD = 16;
const HEADER_H = 24;
const FONT = 11;
const SMALL = 9;
const LINE_H = 14;
const MAX_DATA_LINES = 3;
const INK = '333333';

const FILL: Record<EventModelingKind, string> = { ui: 'FFFFFF', cmd: 'A9C9F5', evt: 'FFC078', rmo: 'B5E0A0', pcr: 'D9D9D9' };
const GROUP_OF: Record<EventModelingKind, 0 | 1 | 2> = { ui: 0, pcr: 0, cmd: 1, rmo: 1, evt: 2 };
const GROUP_LABEL = ['UI / Automation', 'Command / Read Model', 'Events'];
const KIND_LABEL: Record<EventModelingKind, string> = { ui: 'UI', cmd: 'Command', evt: 'Event', rmo: 'Read model', pcr: 'Processor' };

interface Lane {
  key: string;
  label: string;
  group: number;
  y: number;
  h: number;
}

/** Data text for a frame, flattened to at most {@link MAX_DATA_LINES} wrapped lines. */
function dataLines(frame: EventModelingFrame, ast: EventModelingDiagram): string[] {
  const raw = (frame.dataRef !== undefined ? ast.data.get(frame.dataRef) : undefined) ?? frame.inlineData;
  if (raw === undefined) return [];
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (flat === '') return [];
  const lines = wrapText(flat, SMALL, CARD_W - 12);
  if (lines.length <= MAX_DATA_LINES) return lines;
  const kept = lines.slice(0, MAX_DATA_LINES);
  kept[MAX_DATA_LINES - 1] = `${kept[MAX_DATA_LINES - 1]} ...`;
  return kept;
}

const statementText = (list: EventModelingStatement[]): string => list.map((s) => `${KIND_LABEL[s.kind]} ${s.name}`).join(', ');

/** Translate a parsed Event Modeling diagram into a self-contained WordprocessingML paragraph. */
export function translateEventModelingToOoxml(ast: EventModelingDiagram): string {
  if (ast.frames.length === 0) return noteParagraph('An Event Modeling diagram needs at least one frame to render.');

  const nextId = createIdAllocator();
  const parts: string[] = [];

  // Per-frame content, so lane heights can be sized before anything is drawn.
  const cards = ast.frames.map((f) => {
    const nameLines = wrapText(f.name, FONT, CARD_W - 12).slice(0, 3);
    const data = dataLines(f, ast);
    const notes = ast.notes.filter((n) => n.frame === f.id).map((n) => wrapText(n.text.replace(/\s+/g, ' ').trim(), SMALL, CARD_W - 12).slice(0, 4));
    const cardH = 12 + nameLines.length * LINE_H + (data.length > 0 ? 4 + data.length * 12 : 0);
    const noteH = notes.reduce((h, n) => h + n.length * 12 + 8, 0);
    return { f, nameLines, data, notes, cardH, noteH };
  });

  // Lanes: group order first, first appearance within a group.
  const lanes: Lane[] = [];
  for (const c of cards) {
    const ns = c.f.namespace ?? '';
    const key = `${ns}\u0000${GROUP_OF[c.f.kind]}`;
    if (!lanes.some((l) => l.key === key)) {
      lanes.push({ key, label: `${ns ? `${ns} / ` : ''}${GROUP_LABEL[GROUP_OF[c.f.kind]]}`, group: GROUP_OF[c.f.kind], y: 0, h: 0 });
    }
  }
  lanes.sort((a, b) => a.group - b.group);
  const laneOf = (f: EventModelingFrame): Lane => lanes.find((l) => l.key === `${f.namespace ?? ''}\u0000${GROUP_OF[f.kind]}`) as Lane;
  for (const c of cards) {
    const lane = laneOf(c.f);
    lane.h = Math.max(lane.h, c.cardH + c.noteH + 2 * PAD);
  }
  let y = HEADER_H + 8;
  for (const lane of lanes) {
    lane.y = y;
    y += lane.h;
  }
  const lanesBottom = y;

  const scenarioLines = ast.scenarios.map((s) => {
    const when = s.when.length > 0 ? ` When ${statementText(s.when)};` : '';
    return `Scenario @${s.frame}: Given ${statementText(s.given)};${when} Then ${statementText(s.then)}`;
  });
  const W = LABEL_W + ast.frames.length * COL_W + PAD;
  const scenarioWrapped = scenarioLines.flatMap((t) => wrapText(t, SMALL + 1, W - 2 * PAD - 8));
  const H = lanesBottom + (scenarioWrapped.length > 0 ? 16 + scenarioWrapped.length * 13 + 8 : PAD);

  const { scale: s } = scaledExtent(W, H);
  const emu = (v: number): number => scalePt(v, s);
  const thin = scaledLineWidthEmu(9525, s);
  const text = (x: number, ty: number, w: number, lines: string[], opts: { align?: 'left' | 'center'; bold?: boolean; color?: string; fontPx?: number; italic?: boolean; lineH?: number } = {}): void => {
    parts.push(
      boxShape(nextId(), emu(x), emu(ty), emu(w), emu(lines.length * (opts.lineH ?? LINE_H)), lines, { color: opts.color ?? INK, align: opts.align ?? 'left', bold: opts.bold, italic: opts.italic, noWrap: true }, opts.fontPx ?? FONT, s),
    );
  };

  // Swimlane bands and labels.
  lanes.forEach((lane, i) => {
    parts.push(rect(nextId(), emu(0), emu(lane.y), emu(W), emu(lane.h), i % 2 === 0 ? 'F7F7F7' : 'FFFFFF', 'D0D0D0', `Lane ${lane.label}`));
    text(6, lane.y + lane.h / 2 - 14, LABEL_W - 12, wrapText(lane.label, FONT - 1, LABEL_W - 16).slice(0, 2), { bold: true, fontPx: FONT - 1 });
  });

  // Column headers: the frame number.
  ast.frames.forEach((f, i) => {
    text(LABEL_W + i * COL_W, 4, COL_W, [f.reset ? `${f.id} (reset)` : f.id], { align: 'center', bold: true, color: '7F7F7F', fontPx: FONT - 1 });
  });

  // Card geometry first (arrows need every endpoint), then arrows, then cards on top.
  const geo = new Map<string, { cx: number; cy: number; hw: number; hh: number }>();
  cards.forEach((c, i) => {
    const lane = laneOf(c.f);
    const top = lane.y + PAD;
    const x = LABEL_W + i * COL_W + (COL_W - CARD_W) / 2;
    if (!geo.has(c.f.id)) geo.set(c.f.id, { cx: x + CARD_W / 2, cy: top + c.cardH / 2, hw: CARD_W / 2, hh: c.cardH / 2 });
  });
  ast.frames.forEach((f, i) => {
    const targets = f.sources.length > 0 ? f.sources : !f.reset && i > 0 ? [(ast.frames[i - 1] as EventModelingFrame).id] : [];
    const to = geo.get(f.id);
    // A frame may reappear with a duplicate id; the first one owns the geometry, so link by index instead.
    const own = cards[i];
    if (!to || !own) return;
    const lane = laneOf(f);
    const x = LABEL_W + i * COL_W + (COL_W - CARD_W) / 2;
    const tg = { cx: x + CARD_W / 2, cy: lane.y + PAD + own.cardH / 2, hw: CARD_W / 2, hh: own.cardH / 2 };
    for (const src of targets) {
      const from = geo.get(src);
      if (!from || (from.cx === tg.cx && from.cy === tg.cy)) continue;
      const a = edgePoint(from.cx, from.cy, from.hw, from.hh, tg.cx, tg.cy);
      const b = edgePoint(tg.cx, tg.cy, tg.hw, tg.hh, from.cx, from.cy);
      parts.push(connector(nextId(), emu(a.x), emu(a.y), emu(b.x), emu(b.y), '595959', thin, 'solid', 'none', 'sm', 'triangle', 'sm'));
    }
  });

  cards.forEach((c, i) => {
    const lane = laneOf(c.f);
    const x = LABEL_W + i * COL_W + (COL_W - CARD_W) / 2;
    const top = lane.y + PAD;
    parts.push(rect(nextId(), emu(x), emu(top), emu(CARD_W), emu(c.cardH), FILL[c.f.kind], c.f.reset ? '7F7F7F' : INK, `Frame ${c.f.id}`, true));
    text(x + 4, top + 6, CARD_W - 8, c.nameLines, { align: 'center', bold: true, fontPx: fitFont(c.nameLines.map((l) => `${l}  `), FONT, CARD_W - 24, 7).fontPx });
    if (c.data.length > 0) text(x + 4, top + 8 + c.nameLines.length * LINE_H, CARD_W - 8, c.data, { align: 'center', fontPx: SMALL, lineH: 12, color: '404040' });
    let ny = top + c.cardH + 6;
    for (const note of c.notes) {
      const h = note.length * 12 + 4;
      parts.push(rect(nextId(), emu(x), emu(ny), emu(CARD_W), emu(h), 'FFF2A8', 'BFA900', 'Note'));
      text(x + 4, ny + 2, CARD_W - 8, note, { fontPx: SMALL, lineH: 12 });
      ny += h + 4;
    }
  });

  if (scenarioWrapped.length > 0) {
    text(PAD, lanesBottom + 4, W - 2 * PAD, scenarioWrapped, { fontPx: SMALL + 1, lineH: 13, italic: true, color: '404040' });
  }

  return wrapDrawingCanvas(parts.join('\n'), W, H, nextId(), 'Event Modeling diagram');
}
