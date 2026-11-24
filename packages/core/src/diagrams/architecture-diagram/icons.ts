/**
 * The icons Mermaid 12.3 builds into `architecture-beta` (`cloud`, `database`, `disk`, `internet`,
 * `server`, plus `blank` and the `?` it shows for an icon it does not have), drawn as DrawingML paths:
 * white strokes on a blue square, as Mermaid shows them. The drawings are this project's own, in the
 * same spirit as Mermaid's (a rack, a cylinder, a hard disk, a globe, a cloud); none of its path data is
 * reused.
 *
 * Each glyph is authored in an 80-unit square (Mermaid's icon size) and placed by a {@link Pen} into the
 * coordinates of the shape that carries it, so an icon and its label stay one shape in Word.
 */

import { pathUnits } from '../../translator/custom-geometry.js';

/** Mermaid's icon background. */
export const ICON_FILL = '087EBF';
export const ICON_STROKE = 'FFFFFF';

/** Icon names Mermaid draws without any icon pack. */
export const BUILT_IN_ICONS: ReadonlySet<string> = new Set(['cloud', 'database', 'disk', 'internet', 'server', 'blank']);

const DEG = 60000;

/** Writes path operations for a glyph authored in an 80-unit square, placed at (`ox`, `oy`) and `size` px wide. */
class Pen {
  private readonly ops: string[] = [];
  private readonly k: number;

  constructor(
    private readonly ox: number,
    private readonly oy: number,
    size: number,
  ) {
    this.k = size / 80;
  }

  private pt(x: number, y: number): string {
    return `<a:pt x="${pathUnits(this.ox + x * this.k)}" y="${pathUnits(this.oy + y * this.k)}"/>`;
  }

  move(x: number, y: number): this {
    this.ops.push(`<a:moveTo>${this.pt(x, y)}</a:moveTo>`);
    return this;
  }

  line(x: number, y: number): this {
    this.ops.push(`<a:lnTo>${this.pt(x, y)}</a:lnTo>`);
    return this;
  }

  /** An arc of the ellipse (`rx`, `ry`) the current point lies on at `start` degrees, turning `sweep` degrees (clockwise on screen when positive). */
  arc(rx: number, ry: number, start: number, sweep: number): this {
    this.ops.push(`<a:arcTo wR="${pathUnits(rx * this.k)}" hR="${pathUnits(ry * this.k)}" stAng="${Math.round(start * DEG)}" swAng="${Math.round(sweep * DEG)}"/>`);
    return this;
  }

  /** From the current point, which lies on the circle centred at (`cx`, `cy`), round to the `end` angle (degrees, clockwise). */
  arcAround(cx: number, cy: number, fromX: number, fromY: number, end: number): this {
    const r = Math.hypot(fromX - cx, fromY - cy);
    const start = (Math.atan2(fromY - cy, fromX - cx) * 180) / Math.PI;
    let sweep = end - start;
    while (sweep <= 0) sweep += 360;
    while (sweep > 360) sweep -= 360;
    return this.arc(r, r, start, sweep);
  }

  close(): this {
    this.ops.push('<a:close/>');
    return this;
  }

  circle(cx: number, cy: number, r: number): this {
    return this.move(cx - r, cy).arc(r, r, 180, 360).close();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    return this.move(cx - rx, cy).arc(rx, ry, 180, 360).close();
  }

  segment(x1: number, y1: number, x2: number, y2: number): this {
    return this.move(x1, y1).line(x2, y2);
  }

  /** A rectangle with corners of radius `r`. */
  box(x: number, y: number, w: number, h: number, r: number): this {
    if (r <= 0) return this.move(x, y).line(x + w, y).line(x + w, y + h).line(x, y + h).close();
    return this.move(x + r, y)
      .line(x + w - r, y)
      .arc(r, r, 270, 90)
      .line(x + w, y + h - r)
      .arc(r, r, 0, 90)
      .line(x + r, y + h)
      .arc(r, r, 90, 90)
      .line(x, y + r)
      .arc(r, r, 180, 90)
      .close();
  }

  toString(): string {
    return this.ops.join('');
  }
}

function server(p: Pen): void {
  p.box(18, 18, 44, 44, 2).segment(18, 32.5, 62, 32.5).segment(18, 47.5, 62, 47.5);
  for (const y of [25.25, 40, 54.75]) {
    p.segment(44, y, 56, y);
    for (const x of [23, 28, 33]) p.circle(x, y, 0.8);
  }
}

function database(p: Pen): void {
  p.ellipse(40, 23, 20, 7).segment(20, 23, 20, 57).segment(60, 23, 60, 57);
  for (const y of [35, 46, 57]) p.move(20, y).arc(20, 7, 180, -180);
}

function disk(p: Pen): void {
  p.box(21, 15, 38, 50, 1.5).circle(40, 34, 13).circle(40, 34, 3.5).segment(37, 45, 30, 57);
  for (const [x, y] of [[25, 19], [55, 19], [25, 61], [55, 61]] as const) p.circle(x, y, 1);
}

function internet(p: Pen): void {
  p.circle(40, 40, 22).segment(40, 18, 40, 62).segment(18, 40, 62, 40).ellipse(40, 40, 10, 22);
  p.segment(21, 29, 59, 29).segment(21, 51, 59, 51);
}

function cloud(p: Pen): void {
  // Three bumps on a flat base, each arc starting where the previous one ended.
  const bump = (cx: number, cy: number, from: [number, number], end: number): [number, number] => {
    p.arcAround(cx, cy, from[0], from[1], end);
    const r = Math.hypot(from[0] - cx, from[1] - cy);
    return [cx + r * Math.cos((end * Math.PI) / 180), cy + r * Math.sin((end * Math.PI) / 180)];
  };
  let at: [number, number] = [27, 54];
  p.move(...at);
  at = bump(27, 46, at, 300);
  at = bump(42, 40, at, 350);
  bump(54, 46, at, 90);
  p.line(27, 54).close();
}

function unknown(p: Pen): void {
  p.move(31, 30).arc(9, 9, 180, 270).line(40, 47).circle(40, 56, 1.6);
}

const GLYPHS: Readonly<Record<string, (p: Pen) => void>> = { server, database, disk, internet, cloud, blank: () => undefined };

/**
 * The paths of icon `name` in a square of `size` px at (`x`, `y`) of a shape: the blue square (filled, no
 * outline) and the white glyph (outlined, unfilled). An icon Mermaid does not build in gets its `?`.
 */
export function iconPaths(name: string, x: number, y: number, size: number): Array<['norm', string, { stroke: false }] | ['none', string]> {
  const square = new Pen(x, y, size).box(0, 0, 80, 80, 0).toString();
  const pen = new Pen(x, y, size);
  (GLYPHS[name] ?? unknown)(pen);
  const glyph = pen.toString();
  return glyph ? [['norm', square, { stroke: false }], ['none', glyph]] : [['norm', square, { stroke: false }]];
}

/** The outline Mermaid draws for a service without an icon: rounded top corners, flat bottom. */
export function bareServicePath(x: number, y: number, size: number): string {
  const r = (5 * size) / 80;
  const u = pathUnits;
  return (
    `<a:moveTo><a:pt x="${u(x)}" y="${u(y + size)}"/></a:moveTo>` +
    `<a:lnTo><a:pt x="${u(x)}" y="${u(y + r)}"/></a:lnTo><a:arcTo wR="${u(r)}" hR="${u(r)}" stAng="${180 * DEG}" swAng="${90 * DEG}"/>` +
    `<a:lnTo><a:pt x="${u(x + size - r)}" y="${u(y)}"/></a:lnTo><a:arcTo wR="${u(r)}" hR="${u(r)}" stAng="${270 * DEG}" swAng="${90 * DEG}"/>` +
    `<a:lnTo><a:pt x="${u(x + size)}" y="${u(y + size)}"/></a:lnTo><a:close/>`
  );
}
