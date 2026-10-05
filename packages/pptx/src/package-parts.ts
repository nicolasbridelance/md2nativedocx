/**
 * Static OPC parts of the generated `.pptx` (theme, blank master/layout) and the per-deck parts
 * (presentation, content types, relationships). Everything is self-contained: no relationship
 * ever carries `TargetMode="External"` (AGENTS.md rule #3).
 */

import { escapeXml } from '@md2nativedocx/core';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 16:9 widescreen slide size in EMU (13.333 in x 7.5 in). */
export const SLIDE_WIDTH = 12192000;
export const SLIDE_HEIGHT = 6858000;

const EMPTY_TREE_HEAD = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

export function contentTypesXml(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join('');
  return (
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
    slides +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>'
  );
}

export const ROOT_RELS_XML =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${REL_BASE}/officeDocument" Target="ppt/presentation.xml"/>` +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  `<Relationship Id="rId3" Type="${REL_BASE}/extended-properties" Target="docProps/app.xml"/>` +
  '</Relationships>';

export function coreXml(title: string, isoDate: string): string {
  return (
    XML_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title><dc:creator>md2nativedocx</dc:creator><cp:lastModifiedBy>md2nativedocx</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

export function appXml(slideCount: number): string {
  return (
    XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `<Application>md2nativedocx</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slideCount}</Slides>` +
    '</Properties>'
  );
}

export function presentationXml(slideCount: number): string {
  const ids = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  return (
    XML_DECL +
    `<p:presentation ${NS_A} ${NS_R} ${NS_P}>` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="${SLIDE_WIDTH}" cy="${SLIDE_HEIGHT}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    '</p:presentation>'
  );
}

export function presentationRelsXml(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) => `<Relationship Id="rId${i + 2}" Type="${REL_BASE}/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join('');
  const next = slideCount + 2;
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL_BASE}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}` +
    `<Relationship Id="rId${next}" Type="${REL_BASE}/presProps" Target="presProps.xml"/>` +
    `<Relationship Id="rId${next + 1}" Type="${REL_BASE}/viewProps" Target="viewProps.xml"/>` +
    `<Relationship Id="rId${next + 2}" Type="${REL_BASE}/theme" Target="theme/theme1.xml"/>` +
    `<Relationship Id="rId${next + 3}" Type="${REL_BASE}/tableStyles" Target="tableStyles.xml"/>` +
    '</Relationships>'
  );
}

/** Empty presentation/view properties and table styles: PowerPoint always writes these parts. */
export const PRES_PROPS_XML = XML_DECL + `<p:presentationPr ${NS_A} ${NS_R} ${NS_P}/>`;
export const VIEW_PROPS_XML = XML_DECL + `<p:viewPr ${NS_A} ${NS_R} ${NS_P}/>`;
export const TABLE_STYLES_XML =
  XML_DECL + `<a:tblStyleLst ${NS_A} def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;

export const SLIDE_RELS_XML =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${REL_BASE}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
  '</Relationships>';

export const SLIDE_MASTER_XML =
  XML_DECL +
  `<p:sldMaster ${NS_A} ${NS_R} ${NS_P}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE_HEAD}</p:spTree></p:cSld>` +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>' +
  '<p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle>' +
  '<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>';

export const SLIDE_MASTER_RELS_XML =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${REL_BASE}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_BASE}/theme" Target="../theme/theme1.xml"/>` +
  '</Relationships>';

export const SLIDE_LAYOUT_XML =
  XML_DECL +
  `<p:sldLayout ${NS_A} ${NS_R} ${NS_P} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE_HEAD}</p:spTree></p:cSld>` +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

export const SLIDE_LAYOUT_RELS_XML =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${REL_BASE}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
  '</Relationships>';

const FILL_LIST = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3);

export const THEME_XML =
  XML_DECL +
  `<a:theme ${NS_A} name="md2nativedocx"><a:themeElements>` +
  '<a:clrScheme name="md2nativedocx">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="md2nativedocx"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  `<a:fmtScheme name="md2nativedocx"><a:fillStyleLst>${FILL_LIST}</a:fillStyleLst>` +
  '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  `<a:bgFillStyleLst>${FILL_LIST}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

/** Wrap already-built shape XML into a complete slide part. */
export function slideXml(shapes: string): string {
  return (
    XML_DECL +
    `<p:sld ${NS_A} ${NS_R} ${NS_P}><p:cSld><p:spTree>${EMPTY_TREE_HEAD}${shapes}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}
