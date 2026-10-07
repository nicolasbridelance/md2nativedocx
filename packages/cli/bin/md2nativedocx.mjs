#!/usr/bin/env node
/**
 * md2nativedocx CLI.
 *
 * `npx md2nativedocx rapport.md -o rapport.docx` packages the Pandoc invocation
 * with the md2nativedocx Lua filter, producing a .docx with native, editable
 * OOXML vector shapes for every ```mermaid block — or, for a flowchart shape
 * `classifyTopology()` accepts (chain/tree/cycle, spec §4), an editable native
 * SmartArt diagram instead (spec §7 step 5). See postprocess.mjs's
 * `injectSmartArtParts` doc comment for how that dispatch is wired end to end.
 *
 * The conversion itself is `convert()` (src/convert.mjs), the package's
 * library entry point; this file only reads the `MD2NATIVEDOCX_*` variables
 * into its options (src/envOptions.mjs), handles files and arguments, and
 * reports warnings, errors and the Word compatibility check.
 *
 * Security (AGENTS.md):
 *   * Rule #4: Pandoc is invoked via execFile with an argument array — never a
 *     shell string that interpolates a file path (src/convert.mjs).
 *   * Path traversal: input/output paths are resolved and validated against the
 *     expected root before any file operation.
 *   * Errors are typed (ParseError/TranslationError) and mapped to exit codes.
 */

import { execFileSync } from 'node:child_process';
import { basename, extname } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { CliError, resolveSafePath } from '../src/cliSupport.mjs';
import { ConversionError, convert } from '../src/convert.mjs';
import { hasLayoutOptions, readConvertOptionsFromEnv } from '../src/envOptions.mjs';

// `-o something.pptx` takes the Pandoc-free deck path (packages/pptx), dispatched before anything a
// .docx export needs.
{
  const argv = process.argv.slice(2);
  const outIndex = argv.findIndex((a) => a === '-o' || a === '--output');
  if (outIndex !== -1 && /\.pptx$/i.test(argv[outIndex + 1] ?? '')) {
    const { runPptxCli } = await import('../src/pptxExport.mjs');
    process.exit(await runPptxCli(argv, process.cwd()));
  }
}

const USAGE = `Usage: md2nativedocx <input.md> -o <output.docx|output.pptx> [options]

A .pptx output is a slide deck: one slide per \`\`\`mermaid block, titled with the nearest
preceding heading (text outside diagrams is not exported).

Options:
  -o, --output <file>   Output .docx or .pptx path (required)
  --show-source         .pptx only: show each diagram's Mermaid source beside it
  -h, --help            Show this help
`;

function parseArgs(argv) {
  const args = { input: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '-o' || a === '--output') {
      args.output = argv[++i];
      if (!args.output) throw new CliError('Missing value for --output', 2);
    } else if (a.startsWith('-')) {
      throw new CliError(`Unknown option: ${a}`, 2);
    } else if (args.input === null) {
      args.input = a;
    } else {
      throw new CliError(`Unexpected argument: ${a}`, 2);
    }
  }
  return args;
}

async function main() {
  const cwd = process.cwd();
  const options = readConvertOptionsFromEnv(process.env);
  // A custom reference document wins over page/typography options (spec §2.1, option (a)). Said as an
  // info line, not with the `md2nativedocx: ` prefix that counts as a warning: nothing is wrong with
  // the export, the user should just know.
  if (options.referenceDoc && hasLayoutOptions(options.layout)) {
    process.stderr.write(
      'md2nativedocx (info): page/typography options are ignored because a custom reference document (MD2NATIVEDOCX_REFERENCE_DOC) is set.\n',
    );
  }

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n${USAGE}`);
      process.exit(err.exitCode);
    }
    throw err;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!args.input) {
    process.stderr.write(`Missing input file.\n${USAGE}`);
    process.exit(2);
  }
  if (!args.output) {
    process.stderr.write(`Missing output file (-o).\n${USAGE}`);
    process.exit(2);
  }

  // Validate paths (anti path traversal): a path outside the working directory is a usage error (exit 2),
  // as on the .pptx path.
  let input;
  let output;
  try {
    input = resolveSafePath(args.input, cwd);
    output = resolveSafePath(args.output, cwd);
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(err.exitCode);
    }
    throw err;
  }
  if (!existsSync(input)) {
    process.stderr.write(`Input file not found: ${args.input}\n`);
    process.exit(1);
  }

  let result;
  try {
    result = await convert({ path: input }, { ...options, cwd });
  } catch (err) {
    if (err instanceof ConversionError) {
      process.stderr.write(`md2nativedocx: ${err.message}\n`);
      // `exportService.ts` (VS Code) reads Pandoc's own message, e.g. to tell a missing Pandoc apart.
      if (err.stage === 'pandoc' && err.pandocStderr) process.stderr.write(err.pandocStderr);
      process.exit(1);
    }
    throw err;
  }
  writeFileSync(output, result.document);

  // Surface the diagrams' non-fatal notices: never let a successful export silently hide something the
  // author should know about.
  const warnings = result.warnings.map((w) => `md2nativedocx: ${w}`);
  const wordCompatibility = runWordCompatibilityCheck(output);
  const logPath = writeExportLog({ input, output, warnings, rawStderr: result.pandocStderr, wordCompatibility });
  if (warnings.length > 0) {
    process.stdout.write(`Warnings: ${warnings.length} (see ${basename(logPath)})\n`);
    for (const warning of warnings) process.stderr.write(`${warning}\n`);
  }
  process.stdout.write(`Wrote ${basename(output)}\n`);
}

/**
 * Word compatibility check (ADR 0007 part D) — validates the generated
 * `.docx` against the exact schema real Word enforces strictly, via
 * `scripts/oxml-validator/`'s DLL (Microsoft's own Open XML SDK). See
 * `AGENTS.md` → "Diagnosing 'Word won't open the file'" and ADR 0006 for
 * why this exists: neither well-formed-XML checks nor LibreOffice (which
 * this project already uses for `test:visual`) can catch a schema
 * violation Word rejects outright — that gap cost 7 rounds of
 * manually-compared, individually-disproven hypotheses in the SmartArt
 * "cycle" corruption incident before this validator found the real cause
 * in a single pass.
 *
 * Opt-in via `MD2NATIVEDOCX_OXML_VALIDATOR_DLL` (the vendored DLL path,
 * set by the VS Code extension's `dotnetProvisioner.ts` when
 * `md2nativedocx.wordCompatibilityCheck.enabled` is on) — unset for a
 * standalone `npx md2nativedocx` install, which doesn't ship the DLL, so
 * this is a no-op there unless a user sets both env vars by hand.
 * `MD2NATIVEDOCX_DOTNET_BIN` mirrors `MD2NATIVEDOCX_PANDOC_BIN`'s own
 * "defaults to the bare command name, letting a provisioner override it"
 * convention.
 *
 * Never throws: an export that already succeeded must never be reported as
 * failed because this optional, best-effort check couldn't run (`dotnet`
 * missing, DLL missing, unexpected crash) — same rule already applied to
 * `extractWarnings`/`readWarningCount` elsewhere in this pipeline. Returns
 * `null` when not run at all (env var unset), or
 * `{ ran: true, diagramErrors, otherErrors }` /
 * `{ ran: false, reason }` otherwise.
 */
function runWordCompatibilityCheck(docxPath) {
  const dllPath = process.env.MD2NATIVEDOCX_OXML_VALIDATOR_DLL;
  if (!dllPath) return null;

  const dotnetBin = process.env.MD2NATIVEDOCX_DOTNET_BIN || 'dotnet';
  try {
    const stdout = execFileSync(dotnetBin, [dllPath, docxPath, '--json'], { encoding: 'utf8' });
    const report = JSON.parse(stdout.trim().split('\n').pop());
    const diagramErrors = report.errors.filter((e) => e.Part?.startsWith('/word/diagrams/'));
    const otherErrors = report.errors.filter((e) => !e.Part?.startsWith('/word/diagrams/'));
    return { ran: true, diagramErrors, otherErrors };
  } catch (err) {
    // execFileSync throws on a non-zero exit (errorCount > 0 also exits 1,
    // per scripts/oxml-validator/OpenXmlValidator.cs) -- but it still wrote
    // the JSON report to stdout first, captured on the error object.
    const stdout = err.stdout?.toString();
    if (stdout) {
      try {
        const report = JSON.parse(stdout.trim().split('\n').pop());
        if (Array.isArray(report.errors)) {
          const diagramErrors = report.errors.filter((e) => e.Part?.startsWith('/word/diagrams/'));
          const otherErrors = report.errors.filter((e) => !e.Part?.startsWith('/word/diagrams/'));
          return { ran: true, diagramErrors, otherErrors };
        }
      } catch {
        // Fall through to the generic "could not run" case below.
      }
    }
    return { ran: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Write a plain-text log next to the output .docx (same basename, `.log`
 * extension) so a click-right export (no VS Code Problems panel in view) has
 * somewhere durable to point to — spec §10, "surface warnings". Written on
 * every successful export, not just when there are warnings, for a
 * consistent, discoverable location. */
function writeExportLog({ input, output, warnings, rawStderr, wordCompatibility }) {
  const logPath = extname(output).toLowerCase() === '.docx'
    ? output.slice(0, -extname(output).length) + '.log'
    : `${output}.log`;
  const lines = [
    'md2nativedocx export log',
    `Date: ${new Date().toISOString()}`,
    `Input: ${input}`,
    `Output: ${output}`,
    `Warnings: ${warnings.length}`,
    '',
  ];
  if (warnings.length > 0) {
    lines.push(...warnings.map((w) => `- ${w.replace(/^md2nativedocx:\s*(warning:\s*)?/, '')}`), '');
  } else {
    lines.push('No warnings.', '');
  }
  lines.push('--- Word compatibility check ---', ...formatWordCompatibility(wordCompatibility), '');
  if (rawStderr && rawStderr.trim().length > 0) {
    lines.push('--- Raw Pandoc/tool output ---', rawStderr.trimEnd(), '');
  }
  writeFileSync(logPath, lines.join('\n'), 'utf8');
  return logPath;
}

/** Renders {@link runWordCompatibilityCheck}'s result as `.log` lines. Kept
 * separate from that function so the "not run at all" (feature off) case
 * reads as a plain, unalarming note rather than something that looks like a
 * missing/failed check — most exports won't have this env var set at all
 * (standalone CLI usage, or the VS Code setting turned off). */
function formatWordCompatibility(result) {
  if (result === null) {
    return ['Not checked (md2nativedocx.wordCompatibilityCheck is off, or this is a standalone CLI export).'];
  }
  if (!result.ran) {
    return [`Not checked (could not run: ${result.reason}).`];
  }
  if (result.diagramErrors.length === 0) {
    const note = result.otherErrors.length > 0
      ? ` (${result.otherErrors.length} pre-existing schema note(s) elsewhere, unrelated to this export's diagram content — see TODO.md)`
      : '';
    return [`0 error(s) — validated against the same schema Word itself enforces.${note}`];
  }
  const lines = [`${result.diagramErrors.length} error(s) found in the generated diagram content:`];
  for (const e of result.diagramErrors) {
    lines.push(`  - ${e.Path}: ${e.Description}`);
  }
  return lines;
}

main().catch((err) => {
  process.stderr.write(`md2nativedocx: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
