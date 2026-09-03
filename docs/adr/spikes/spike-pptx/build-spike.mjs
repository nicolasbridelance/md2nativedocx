#!/usr/bin/env node
// Phase 0 spike — hand-assemble a minimal valid `.pptx` OPC package containing
// one slide with two DrawingML shapes (a rect + a diamond, same preset
// geometries `packages/core/src/translator/ooxml-translator.ts` uses for a
// Mermaid flowchart) and one connector (`p:cxnSp`) between them, using
// `a:stCxn`/`a:endCxn` connection-site indices.
//
// Purpose: `cahier_des_charges_google_slides.md` §8 "Phase 0 — Spike de
// validation" — prove a minimal, self-contained `.pptx` (no external
// relationships, same OOXML/DrawingML family as the existing `.docx`
// translator) can be produced by hand, is a well-formed OPC package, and
// renders as two connected, distinct shapes rather than a blank slide or a
// single flattened image. This is NOT a test of real Google Slides import —
// see spike.md's "Reste à faire" for what still needs human verification
// there.
//
// Zero new dependencies (AGENTS.md rule #6): only Node built-ins, plus the
// system `zip` binary invoked via `execFile` with an argument array (never a
// shell string — AGENTS.md rule #4, applied here even though this spike
// script is not the Pandoc bridge the rule literally names).
//
// Run:
//   node build-spike.mjs
// Produces ./spike.pptx (overwriting any existing file).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, 'spike.pptx');

/**
 * Strict XML escaping (mirrors `packages/core/src/translator/xml-escape.ts`,
 * AGENTS.md rule #2). Applied here even to the two hardcoded shape labels
 * below — they happen to be literal strings in this spike, but a real pptx
 * translator would feed untrusted Mermaid text through exactly this path, so
 * the spike models the same discipline rather than skipping it as "obviously
 * safe."
 */
function escapeXml(input) {
  return input.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[ch]);
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ---------------------------------------------------------------------------
// Shape geometry (EMU, same unit docx uses — cahier des charges §7: pptx
// uses EMU natively too, no new unit-conversion layer).
// ---------------------------------------------------------------------------

const RECT = { x: 914400, y: 2286000, cx: 1828800, cy: 914400 }; // 1in,2.5in,2in,1in
const DIAMOND = { x: 4572000, y: 2057400, cx: 1828800, cy: 1371600 }; // 5in,2.25in,2in,1.5in

/**
 * Connection-site indices, copied verbatim from
 * `packages/core/src/translator/ooxml-translator.ts`'s `SITE` constant:
 * 0=top, 1=left, 2=bottom, 3=right (anti-clockwise from top), empirically
 * corrected there against LibreOffice/Microsoft's `presetShapeDefinitions.xml`
 * `GluePoints` ordering for `rect`/`diamond`.
 *
 * ASSUMPTION, not yet proven for pptx specifically: DrawingML connection-site
 * semantics are defined by the shape's preset geometry (`a:prstGeom`), which
 * is identical vocabulary in docx (`wps:`) and pptx (`p:`) — so there is a
 * reasonable expectation `stCxn`/`endCxn` idx values carry over unchanged.
 * This spike exercises the horizontal idx=3 (right) / idx=1 (left) pair
 * specifically (the pair that was WRONG in docx until 2026-09-02, see
 * TODO.md) rather than idx=0/2 (top/bottom), which was never in doubt. Only
 * a real PowerPoint/Google Slides render (dragging a shape and checking the
 * connector stays attached) can confirm the magnetic-attachment behavior;
 * LibreOffice headless rendering below only confirms the literal drawn path,
 * not `stCxn`/`endCxn` semantics — see spike.md.
 */
const SITE = { top: 0, right: 3, bottom: 2, left: 1 };

// rect's right edge midpoint -> diamond's left edge midpoint (both boxes
// share the same vertical center, so the connector is a horizontal line).
const CONNECTOR = {
  x: RECT.x + RECT.cx,
  y: RECT.y + RECT.cy / 2,
  cx: DIAMOND.x - (RECT.x + RECT.cx),
  cy: 0,
};

// ---------------------------------------------------------------------------
// OPC parts
// ---------------------------------------------------------------------------

const contentTypesXml =
  XML_DECL +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
`;

// Root package relationships. No `TargetMode="External"` anywhere in this
// file (AGENTS.md rule #3) — every Target is a relative path inside this
// same package.
const rootRelsXml =
  XML_DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
`;

const coreXml =
  XML_DECL +
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>md2nativedocx pptx spike</dc:title>
  <dc:creator>md2nativedocx spike-pptx</dc:creator>
  <cp:lastModifiedBy>md2nativedocx spike-pptx</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-09-02T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-09-02T00:00:00Z</dcterms:modified>
</cp:coreProperties>
`;

const appXml =
  XML_DECL +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>md2nativedocx spike-pptx</Application>
  <PresentationFormat>On-screen Show (4:3)</PresentationFormat>
  <Slides>1</Slides>
  <TitlesOfParts><vt:vector size="0" baseType="lpstr"/></TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>
`;

const presentationXml =
  XML_DECL +
  `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>
`;

// `presentation.xml` -> slideMaster1 (rId1) and slide1 (rId2) only. No direct
// `rId` to theme1.xml here: the theme is reached via slideMaster1's own
// relationships below, matching the actual reference chain PowerPoint
// resolves (presentation -> master -> theme), not a redundant second path.
const presentationRelsXml =
  XML_DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>
`;

// Minimal slideMaster: empty shape tree (no placeholders needed for this
// spike), one layout referenced, one theme referenced.
const slideMasterXml =
  XML_DECL +
  `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>
`;

const slideMasterRelsXml =
  XML_DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>
`;

const slideLayoutXml =
  XML_DECL +
  `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>
`;

const slideLayoutRelsXml =
  XML_DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
`;

// Minimal but complete Office theme (clrScheme + fontScheme + fmtScheme) —
// PowerPoint/Google Slides both expect all three present, even minimally.
const themeXml =
  XML_DECL +
  `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SpikeTheme">
  <a:themeElements>
    <a:clrScheme name="Spike">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Spike">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Spike">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>
`;

/** One `p:sp` text-bearing shape — mirrors `ooxml-translator.ts`'s `renderNode`. */
function renderShape(id, name, prst, box, fill, lineColor, label) {
  const safeName = escapeXml(name);
  const safeLabel = escapeXml(label);
  return `      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="${safeName}"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${box.x}" y="${box.y}"/>
            <a:ext cx="${box.cx}" cy="${box.cy}"/>
          </a:xfrm>
          <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>
          <a:ln w="12700"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr anchor="ctr" wrap="square"/>
          <a:lstStyle/>
          <a:p>
            <a:pPr algn="ctr"/>
            <a:r><a:rPr lang="en-US" sz="2400" dirty="0"/><a:t>${safeLabel}</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
`;
}

/**
 * One `p:cxnSp` connector using `a:stCxn`/`a:endCxn` magnetic connection
 * sites — same DrawingML vocabulary as `wps:cxnSp` in the docx translator
 * (cahier des charges §7 mapping table), just under the `p:` namespace.
 */
function renderConnector(id, name, fromId, fromIdx, toId, toIdx, box, lineColor) {
  const safeName = escapeXml(name);
  return `      <p:cxnSp>
        <p:nvCxnSpPr>
          <p:cNvPr id="${id}" name="${safeName}"/>
          <p:cNvCxnSpPr>
            <a:stCxn id="${fromId}" idx="${fromIdx}"/>
            <a:endCxn id="${toId}" idx="${toIdx}"/>
          </p:cNvCxnSpPr>
          <p:nvPr/>
        </p:nvCxnSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${box.x}" y="${box.y}"/>
            <a:ext cx="${box.cx}" cy="${box.cy}"/>
          </a:xfrm>
          <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
          <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr">
            <a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill>
            <a:prstDash val="solid"/>
            <a:tailEnd type="triangle" w="med" len="med"/>
          </a:ln>
        </p:spPr>
      </p:cxnSp>
`;
}

const RECT_ID = 2;
const DIAMOND_ID = 3;
const CONNECTOR_ID = 4;

const slideXml =
  XML_DECL +
  `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
${renderShape(RECT_ID, 'Node A', 'rect', RECT, 'D9E2F3', '2F5496', 'Node A')}${renderShape(DIAMOND_ID, 'Decision', 'diamond', DIAMOND, 'FCE4D6', 'C55A11', 'Decision')}${renderConnector(CONNECTOR_ID, 'NodeA--Decision', RECT_ID, SITE.right, DIAMOND_ID, SITE.left, CONNECTOR, '2F5496')}    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>
`;

const slideRelsXml =
  XML_DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>
`;

// ---------------------------------------------------------------------------
// Assembly: write every part to a scratch directory, then zip it (via the
// system `zip` binary, `execFile` + argument array — no shell interpolation,
// AGENTS.md rule #4).
// ---------------------------------------------------------------------------

const PARTS = {
  '[Content_Types].xml': contentTypesXml,
  '_rels/.rels': rootRelsXml,
  'docProps/core.xml': coreXml,
  'docProps/app.xml': appXml,
  'ppt/presentation.xml': presentationXml,
  'ppt/_rels/presentation.xml.rels': presentationRelsXml,
  'ppt/slideMasters/slideMaster1.xml': slideMasterXml,
  'ppt/slideMasters/_rels/slideMaster1.xml.rels': slideMasterRelsXml,
  'ppt/slideLayouts/slideLayout1.xml': slideLayoutXml,
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels': slideLayoutRelsXml,
  'ppt/theme/theme1.xml': themeXml,
  'ppt/slides/slide1.xml': slideXml,
  'ppt/slides/_rels/slide1.xml.rels': slideRelsXml,
};

async function main() {
  const buildDir = await mkdtemp(path.join(tmpdir(), 'spike-pptx-'));
  try {
    for (const [relPath, contents] of Object.entries(PARTS)) {
      const abs = path.join(buildDir, relPath);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, contents, 'utf8');
    }

    const tmpZip = path.join(buildDir, 'out.pptx');
    // `-X`: no extra file attributes/timestamps beyond what's needed —
    // deterministic-ish output. Argument array only, per AGENTS.md rule #4.
    await execFileAsync('zip', ['-X', '-r', tmpZip, '.'], { cwd: buildDir });
    await copyFile(tmpZip, OUTPUT_PATH);
    console.log(`Wrote ${OUTPUT_PATH}`);
  } finally {
    await rm(buildDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
