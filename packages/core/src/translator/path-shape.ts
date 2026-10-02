/**
 * Shared freeform-path primitive for Family D translators (radar, ishikawa):
 * absolute-EMU points -> one `wps:wsp` with `a:custGeom`.
 */

/** An absolute point in EMU. */
export interface Pt {
  x: number;
  y: number;
}

/** A freeform path shape from absolute EMU points; closed + filled, or an open polyline. */
export function pathShape(id: number, points: Pt[], closed: boolean, fill: string | undefined, alphaPct: number, line: string, lineEmu: number): string {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX);
  const h = Math.max(1, Math.max(...ys) - minY);
  const [first, ...rest] = points;
  const fillXml = fill
    ? `<a:solidFill><a:srgbClr val="${fill}"><a:alpha val="${alphaPct * 1000}"/></a:srgbClr></a:solidFill>`
    : '<a:noFill/>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Shape ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`,
    '    <a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/>',
    `      <a:pathLst><a:path w="${w}" h="${h}"${closed ? '' : ' fill="none"'}>`,
    `        <a:moveTo><a:pt x="${(first?.x ?? 0) - minX}" y="${(first?.y ?? 0) - minY}"/></a:moveTo>`,
    ...rest.map((p) => `        <a:lnTo><a:pt x="${p.x - minX}" y="${p.y - minY}"/></a:lnTo>`),
    closed ? '        <a:close/>' : '',
    '      </a:path></a:pathLst>',
    '    </a:custGeom>',
    `    ${fillXml}`,
    `    <a:ln w="${lineEmu}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}
