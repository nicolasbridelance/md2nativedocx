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
} from '@md2nativedocx/core';

const inputPath = process.argv[2];
const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');

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
    const generated = generateSmartArt(ast);
    if (!generated) return null;

    const id = randomUUID();
    const dir = join(smartArtDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'data.xml'), generated.dataXml, 'utf8');
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
    process.stdout.write(translateQuadrantToOoxml(ast));
  } else if (diagramType.type === 'venn') {
    // Second non-flowchart diagram type shipped, same module convention.
    const { ast, warnings } = parseVennChart(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateVennToOoxml(ast));
  } else if (diagramType.type === 'mindmap') {
    // Third non-flowchart diagram type shipped, same module convention.
    const { ast, warnings } = parseMindmap(input);
    for (const warning of warnings) {
      process.stderr.write(`md2nativedocx: warning: ${warning}\n`);
    }
    process.stdout.write(translateMindmapToOoxml(ast));
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
      let output = translateToOoxml(ast, result);
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
