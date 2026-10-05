#!/usr/bin/env node
/**
 * Thin CLI bridge between the Pandoc Lua filter and the core engine.
 *
 * Reads Mermaid flowchart text from a file path given as argv[1] (or stdin if
 * no argument), writes an OOXML/DrawingML `<w:p>` fragment to stdout. This
 * keeps the Lua filter free of any shell-string interpolation of diagram
 * text (AGENTS.md rule #4): the filter invokes this binary with a fixed
 * argument array and the diagram text lives in a temp file, never in a
 * shell string.
 *
 * Usage: md2nativedocx-core.mjs <diagram.mmd> > diagram.xml
 *
 * ## Diagram-type guard-rail (docs/specs/FUTURE_full_mermaid_coverage_SPEC.md
 * §4 "Phase 0", item 1)
 *
 * Before any of the below, `detectDiagramType()` checks the first
 * significant line of the input. If it's a *recognized* non-flowchart
 * Mermaid diagram type (`gitGraph`, `mindmap`, `sequenceDiagram`, ...), the
 * flowchart pipeline is never invoked — such text can coincidentally look
 * enough like flowchart syntax to "parse" into a silently-wrong diagram
 * rather than failing cleanly. Instead, a visible gray-italic note
 * (`buildUnsupportedDiagramTypeNoteXml`) is emitted and a warning written to
 * stderr. Unrecognized headers (including a missing one entirely) fall
 * through to the flowchart pipeline unchanged, matching `parseMermaid()`'s
 * existing behavior of accepting arbitrary text without a required header.
 *
 * ## SmartArt dispatch (spec §7 step 5)
 *
 * When `MD2NATIVEDOCX_SMARTART_DIR` is set, this script first tries
 * `classifyTopology()`/`generateSmartArt()` on the parsed diagram. If it's
 * eligible for `chain`/`tree`/`cycle`, the 4 generated diagram parts are
 * written to `<MD2NATIVEDOCX_SMARTART_DIR>/<random id>/` and a `<w:p>`
 * fragment referencing that id via **placeholder** relationship ids
 * (`SMARTART_PLACEHOLDER:<id>:dm` etc. — never real Word `rId`s) is emitted
 * instead of the usual `wpg:wgp` shapes. `packages/cli/src/postprocess.mjs`'s
 * `injectSmartArtParts` (run by the CLI after Pandoc, once the whole `.docx`
 * exists) finds those placeholders and completes the wiring — this script
 * cannot do that part itself, Pandoc's Lua filter API has no mechanism to
 * add new `.docx` package parts or relationships (spec §2).
 *
 * If `MD2NATIVEDOCX_SMARTART_DIR` is unset, or the diagram isn't
 * SmartArt-eligible, or anything in the SmartArt path throws unexpectedly,
 * this silently falls back to the existing `wpg:wgp` translator — the same
 * output as before this dispatch existed. This is deliberate, not just
 * defensive: every flowchart the classifier rejects (subgraphs,
 * merge-after-branch, a tree deeper than `tree.ts` supports, etc.) is
 * expected to still render correctly, and the env-var gate means every
 * caller that doesn't opt in (including this package's own existing tests)
 * is completely unaffected. When it does fall back this way with
 * `MD2NATIVEDOCX_SMARTART_DIR` set, a small gray-italic note is appended
 * under the diagram explaining why (spec §10.3), via
 * `buildSmartArtFallbackNoteXml()`.
 *
 * ## Warnings (spec §10, "surface warnings")
 *
 * Non-fatal parser warnings (`ParseResult.warnings`), non-fatal layout
 * warnings (`LayoutResult.warnings`, e.g. Dagre's cluster+order bug forcing
 * a subgraph-boxes-omitted retry), and the SmartArt fallback message below
 * are all written to stderr, prefixed
 * `md2nativedocx: `. Pandoc's own child-process stderr is inherited by
 * `packages/cli/bin/md2nativedocx.mjs`'s `execFile` call, which counts
 * `md2nativedocx: `-prefixed lines and surfaces them (CLI stdout summary +
 * a `.log` file next to the output; the VS Code extension turns the count
 * into a toast).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  detectDiagramType,
  buildUnsupportedDiagramTypeNoteXml,
  parseMermaid,
  layout,
  translateToOoxml,
  generateSmartArt,
  buildSmartArtDrawingXml,
  classifyTopology,
  buildSmartArtFallbackNoteXml,
  parseQuadrantChart,
  translateQuadrantToOoxml,
  parseVennChart,
  translateVennToOoxml,
  parseMindmap,
  translateMindmapToOoxml,
  parseClassDiagram,
  translateClassDiagramToOoxml,
  parseStateDiagram,
  translateStateDiagramToOoxml,
  parseErDiagram,
  translateErDiagramToOoxml,
  parseRequirementDiagram,
  translateRequirementDiagramToOoxml,
  parseArchitectureDiagram,
  translateArchitectureDiagramToOoxml,
  parseGanttChart,
  translateGanttToOoxml,
  parseC4Diagram,
  translateC4DiagramToOoxml,
  parseGitGraphDiagram,
  translateGitGraphToOoxml,
  parseCynefinDiagram,
  translateCynefinToOoxml,
  parsePieChart,
  translatePieToOoxml,
  translatePieToChart,
  translateXyChartToChart,
  translateRadarToChart,
  parseTimeline,
  translateTimelineToOoxml,
  parseKanban,
  translateKanbanToOoxml,
  parsePacketDiagram,
  translatePacketToOoxml,
  parseTreemap,
  translateTreemapToOoxml,
  parseJourney,
  translateJourneyToOoxml,
  parseTreeView,
  translateTreeViewToOoxml,
  parseRadar,
  translateRadarToOoxml,
  parseIshikawa,
  translateIshikawaToOoxml,
  parseXyChart,
  translateXyChartToOoxml,
  parseBlock,
  translateBlockToOoxml,
  parseSankey,
  translateSankeyToOoxml,
  parseWardley,
  translateWardleyToOoxml,
  parseEventModeling,
  translateEventModelingToOoxml,
  parseSequence,
  translateSequenceToOoxml,
  parseZenuml,
} from '@md2nativedocx/core';

const inputPath = process.argv[2];
const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');

/**
 * `MD2NATIVEDOCX_MAX_DRAWING_CX`/`_CY` (EMU) — set by
 * `packages/cli/bin/md2nativedocx.mjs` from the resolved page format/
 * orientation/margins (export_customization_SPEC.md §2.4, Lot 1) when they
 * differ from the Letter-portrait default `ooxml-translator.ts` otherwise
 * assumes. Absent/unparseable falls back to that default (same
 * `TranslateOptions` field left `undefined`) rather than failing the export
 * over a formatting nicety.
 */
function translateOptionsFromEnv() {
  const cx = Number.parseInt(process.env.MD2NATIVEDOCX_MAX_DRAWING_CX ?? '', 10);
  const cy = Number.parseInt(process.env.MD2NATIVEDOCX_MAX_DRAWING_CY ?? '', 10);
  const options = {};
  if (Number.isFinite(cx) && cx > 0) options.maxDrawingCx = cx;
  if (Number.isFinite(cy) && cy > 0) options.maxDrawingCy = cy;
  return options;
}

/**
 * Try the SmartArt path for `ast`; returns the `<w:p>` fragment to emit, or
 * `null` to fall back to the `wpg:wgp` translator. Never throws — any
 * failure here (including `generateSmartArt` itself, defensively) falls
 * back rather than failing the whole export over an alternate rendering
 * path that was never guaranteed in the first place.
 */
function trySmartArt(ast, smartArtDir) {
  if (!smartArtDir) return null;
  try {
    // The pre-rendered dsp:drawing (fifth part) is opt-in until a real Word confirms it.
    const requestedStyle = process.env.MD2NATIVEDOCX_SMARTART_STYLE;
    const style = requestedStyle === 'colorful' || requestedStyle === 'intense' ? requestedStyle : 'simple';
    const generated = generateSmartArt(ast, { drawing: process.env.MD2NATIVEDOCX_SMARTART_DRAWING === '1', style });
    if (!generated) return null;

    const id = randomUUID();
    const dir = join(smartArtDir, id);
    mkdirSync(dir, { recursive: true });
    if (generated.drawingXml !== undefined) writeFileSync(join(dir, 'drawing.xml'), generated.drawingXml, 'utf8');
    writeFileSync(join(dir, 'data.xml'), generated.dataXml.split('SMARTART_DRAWING_REL').join(`SMARTART_PLACEHOLDER:${id}:dr`), 'utf8');
    writeFileSync(join(dir, 'layout.xml'), generated.layoutXml, 'utf8');
    writeFileSync(join(dir, 'colors.xml'), generated.colorsXml, 'utf8');
    writeFileSync(join(dir, 'quickStyle.xml'), generated.styleXml, 'utf8');

    return buildSmartArtDrawingXml({
      dm: `SMARTART_PLACEHOLDER:${id}:dm`,
      lo: `SMARTART_PLACEHOLDER:${id}:lo`,
      qs: `SMARTART_PLACEHOLDER:${id}:qs`,
      cs: `SMARTART_PLACEHOLDER:${id}:cs`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`md2nativedocx: SmartArt path failed, falling back to shapes: ${message}\n`);
    return null;
  }
}

/**
 * Opt-in native Word chart (ADR 0011) for `pie`, `xychart` and `radar`. Same hand-off as SmartArt: the
 * chart part and the workbook data are written to `<MD2NATIVEDOCX_CHART_DIR>/<random id>/` and the
 * returned `<w:p>` carries a `CHART_PLACEHOLDER:<id>` relationship id that the CLI's post-processing
 * replaces. Never throws: any failure (including a diagram Word cannot chart, e.g. a horizontal xychart
 * with a line series) falls back to the shape-built diagram and says why on stderr.
 *
 * @param {(chartId: string, options: object) => import('@md2nativedocx/core').NativeChart} translate
 */
function tryNativeChart(translate, chartDir, options) {
  if (!chartDir) return null;
  try {
    const id = randomUUID();
    const embedWorkbook = process.env.MD2NATIVEDOCX_CHART_WORKBOOK !== '0';
    const chart = translate(id, { ...options, embedWorkbook });
    const dir = join(chartDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'chart.xml'), chart.chartXml, 'utf8');
    writeFileSync(join(dir, 'data.json'), JSON.stringify(chart.workbook), 'utf8');
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ hasWorkbook: chart.hasWorkbook }), 'utf8');
    return chart.paragraphXml;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`md2nativedocx: warning: native chart not used, drawn as shapes instead: ${message}\n`);
    return null;
  }
}

try {
  // Diagram-type guard-rail (spec §4 "Phase 0", item 1): a recognized
  // non-flowchart diagram (gitGraph, mindmap, sequenceDiagram, ...) must
  // never reach parseMermaid() — its flowchart-shaped grammar can happen to
  // "parse" such text into a silently-wrong diagram (bare words, `((...))`
  // bullets, etc. coincidentally look like valid node syntax) rather than
  // failing cleanly. 'unknown' is deliberately treated the same as
  // 'flowchart' here — see detectDiagramType's doc comment for why.
  const diagramType = detectDiagramType(input);
  if (diagramType.type === 'quadrant') {
    // First non-flowchart diagram type shipped (docs/specs/
    // FUTURE_full_mermaid_coverage_SPEC.md §4 item 2 module convention) —
    // no Dagre layout step, no SmartArt dispatch, straight AST -> OOXML.
    const { ast, warnings } = parseQuadrantChart(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateQuadrantToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'venn') {
    // Second non-flowchart diagram type shipped, same module convention.
    const { ast, warnings } = parseVennChart(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateVennToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'mindmap') {
    // Third non-flowchart diagram type shipped, same module convention.
    const { ast, warnings } = parseMindmap(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateMindmapToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'class') {
    // Fifth non-flowchart diagram type shipped (swimlane-beta, the fourth,
    // is a flowchart alias with no dedicated branch here — see
    // detectDiagramType), first of Family B (reuses Dagre, same module
    // convention otherwise).
    const { ast, warnings } = parseClassDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateClassDiagramToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'state') {
    // Sixth non-flowchart diagram type shipped, second of Family B.
    const { ast, warnings } = parseStateDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateStateDiagramToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'er') {
    // Seventh non-flowchart diagram type shipped, third of Family B.
    const { ast, warnings } = parseErDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateErDiagramToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'requirement') {
    // Eighth non-flowchart diagram type shipped, fourth of Family B.
    const { ast, warnings } = parseRequirementDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateRequirementDiagramToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'architecture') {
    // Ninth non-flowchart diagram type shipped, fifth of Family B.
    const { ast, warnings } = parseArchitectureDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateArchitectureDiagramToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'gantt') {
    // Tenth non-flowchart diagram type shipped, first of Family D (calendar
    // shapes, no `c:chart` — docs/adr/spikes/spike-gantt-parser/spike.md).
    const { ast, warnings } = parseGanttChart(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateGanttToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'c4') {
    // Eleventh non-flowchart diagram type shipped, sixth of Family B.
    const { ast, warnings } = parseC4Diagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateC4DiagramToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'gitGraph') {
    // Twelfth non-flowchart diagram type shipped, first of Family F (fixed
    // branch lanes + fixed commit-sequence axis, no Dagre — re-classified
    // from the spec's original Family B default, see diagrams/git-graph/
    // types.ts's doc comment).
    const { ast, warnings } = parseGitGraphDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateGitGraphToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'cynefin') {
    // Thirteenth non-flowchart diagram type shipped, second of Family D
    // (calculated shapes, no c:chart — same shape as quadrant/venn, NOT a
    // reuse of quadrantChart's own translator, see diagrams/cynefin/
    // types.ts's doc comment for why the "2x2" resemblance is superficial).
    const { ast, warnings } = parseCynefinDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateCynefinToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'pie') {
    // Fourteenth non-flowchart diagram type shipped, third of Family D
    // (calculated `pie`-preset shapes, no c:chart).
    const { ast, warnings } = parsePieChart(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    const nativeChart = tryNativeChart(
      (id, o) => translatePieToChart(ast, id, o),
      process.env.MD2NATIVEDOCX_CHART_DIR,
      translateOptionsFromEnv(),
    );
    process.stdout.write(nativeChart ?? translatePieToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'timeline') {
    // Fifteenth non-flowchart diagram type shipped, fourth of Family D.
    const { ast, warnings } = parseTimeline(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateTimelineToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'kanban') {
    // Sixteenth non-flowchart diagram type shipped, fifth of Family D.
    const { ast, warnings } = parseKanban(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateKanbanToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'packet') {
    // Seventeenth non-flowchart diagram type shipped, sixth of Family D.
    const { ast, warnings } = parsePacketDiagram(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translatePacketToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'treemap') {
    // Eighteenth non-flowchart diagram type shipped, seventh of Family D.
    const { ast, warnings } = parseTreemap(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateTreemapToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'journey') {
    // Nineteenth non-flowchart diagram type shipped, eighth of Family D.
    const { ast, warnings } = parseJourney(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateJourneyToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'treeView') {
    // Twentieth non-flowchart diagram type shipped, ninth of Family D.
    const { ast, warnings } = parseTreeView(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateTreeViewToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'radar') {
    // Twenty-first non-flowchart diagram type shipped, tenth of Family D.
    const { ast, warnings } = parseRadar(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    const nativeChart = tryNativeChart(
      (id, o) => translateRadarToChart(ast, id, o),
      process.env.MD2NATIVEDOCX_CHART_DIR,
      translateOptionsFromEnv(),
    );
    process.stdout.write(nativeChart ?? translateRadarToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'ishikawa') {
    // Twenty-second non-flowchart diagram type shipped, eleventh of Family D.
    const { ast, warnings } = parseIshikawa(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateIshikawaToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'xychart') {
    // Twenty-third non-flowchart diagram type shipped, twelfth of Family D.
    const { ast, warnings } = parseXyChart(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    const nativeChart = tryNativeChart(
      (id, o) => translateXyChartToChart(ast, id, o),
      process.env.MD2NATIVEDOCX_CHART_DIR,
      translateOptionsFromEnv(),
    );
    process.stdout.write(nativeChart ?? translateXyChartToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'block') {
    // Twenty-fourth non-flowchart diagram type shipped, thirteenth of Family D.
    const { ast, warnings } = parseBlock(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateBlockToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'sankey') {
    // Twenty-fifth non-flowchart diagram type shipped, fourteenth of Family D.
    const { ast, warnings } = parseSankey(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateSankeyToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'wardley') {
    // Twenty-sixth non-flowchart diagram type shipped, fifteenth of Family D.
    const { ast, warnings } = parseWardley(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateWardleyToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'eventModeling') {
    // Twenty-seventh non-flowchart diagram type shipped, sixteenth of Family D.
    const { ast, warnings } = parseEventModeling(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateEventModelingToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'sequence') {
    // Twenty-eighth non-flowchart diagram type shipped, first of Family E.
    const { ast, warnings } = parseSequence(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateSequenceToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type === 'zenuml') {
    // Same AST and translator as sequenceDiagram; only the parser differs.
    const { ast, warnings } = parseZenuml(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateSequenceToOoxml(ast, translateOptionsFromEnv()));
  } else if (diagramType.type !== 'flowchart' && diagramType.type !== 'unknown') {
    process.stderr.write(
      `md2nativedocx: warning: ${diagramType.label} diagrams are not yet supported; diagram not converted.\n`,
    );
    process.stdout.write(buildUnsupportedDiagramTypeNoteXml(diagramType));
  } else {
    const { ast, warnings } = parseMermaid(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }

    const smartArtDir = process.env.MD2NATIVEDOCX_SMARTART_DIR;
    const smartArtXml = trySmartArt(ast, smartArtDir);
    if (smartArtXml) {
      process.stdout.write(smartArtXml);
    } else {
      const result = layout(ast);
      for (const warning of result.warnings) {
        process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
      }
      let output = translateToOoxml(ast, result, translateOptionsFromEnv());
      // Only note the fallback when SmartArt was actually attempted for this
      // diagram (smartArtDir set) and rejected for one of classifyTopology's
      // structured reasons — never for an unexpected generation error (already
      // logged by trySmartArt above) and never when SmartArt wasn't attempted
      // at all (spec §10.3: "jamais ... sur le pipeline wpg:wgp").
      if (smartArtDir) {
        const classification = classifyTopology(ast);
        if (!classification.eligible) {
          output += '\n' + buildSmartArtFallbackNoteXml(classification);
        }
      }
      process.stdout.write(output);
    }
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`md2nativedocx: ${message}\n`);
  process.exit(1);
}
