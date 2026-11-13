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

import { basename, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { CliError, resolveSafePath } from '../src/cliSupport.mjs';
import { ConversionError, convert } from '../src/convert.mjs';
import { writeOutputSafely } from '../src/writeOutputSafely.mjs';
import { formatWordCompatibility, runWordCompatibilityCheck } from '../src/wordCheck.mjs';
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

const USAGE = `Usage: md2nativedocx <input.md> -o <output.docx|output.odt|output.pptx> [options]

A .odt output is for LibreOffice: flowcharts become native, editable shapes and connectors;
other diagram types become a note for now.

A .pptx output is a slide deck: one slide per \`\`\`mermaid block, titled with the nearest
preceding heading (text outside diagrams is not exported).

Options:
  -o, --output <file>   Output .docx, .odt or .pptx path (required)
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

  const format = extname(output).toLowerCase() === '.odt' ? 'odt' : 'docx';
  if (format === 'odt' && hasLayoutOptions(options.layout)) {
    process.stderr.write('md2nativedocx (info): page/typography options apply to .docx only; the .odt uses A4 with 2.54 cm margins.\n');
  }
  // MD2NATIVEDOCX_REFERENCE_DOC names a Word template; a .odt keeps the bundled reference.odt.
  const formatOptions = format === 'odt' && options.referenceDoc && extname(options.referenceDoc).toLowerCase() !== '.odt'
    ? { ...options, referenceDoc: undefined }
    : options;

  let result;
  try {
    result = await convert({ path: input }, { ...formatOptions, cwd, format });
  } catch (err) {
    if (err instanceof ConversionError) {
      process.stderr.write(`md2nativedocx: ${err.message}\n`);
      // `exportService.ts` (VS Code) reads Pandoc's own message, e.g. to tell a missing Pandoc apart.
      if (err.stage === 'pandoc' && err.pandocStderr) process.stderr.write(err.pandocStderr);
      process.exit(1);
    }
    throw err;
  }
  try {
    writeOutputSafely(output, result.document);
  } catch (err) {
    if (err instanceof ConversionError) {
      process.stderr.write(`md2nativedocx: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }

  // Surface the diagrams' non-fatal notices: never let a successful export silently hide something the
  // author should know about.
  const warnings = result.warnings.map((w) => `md2nativedocx: ${w}`);
  const wordCompatibility = format === 'docx' ? runWordCompatibilityCheck(output) : null;
  const logPath = writeExportLog({ input, output, warnings, rawStderr: result.pandocStderr, wordCompatibility });
  if (warnings.length > 0) {
    process.stdout.write(`Warnings: ${warnings.length} (see ${basename(logPath)})\n`);
    for (const warning of warnings) process.stderr.write(`${warning}\n`);
  }
  process.stdout.write(`Wrote ${basename(output)}\n`);
}

/** Write a plain-text log next to the output .docx (same basename, `.log`
 * extension) so a click-right export (no VS Code Problems panel in view) has
 * somewhere durable to point to — spec §10, "surface warnings". Written on
 * every successful export, not just when there are warnings, for a
 * consistent, discoverable location. */
function writeExportLog({ input, output, warnings, rawStderr, wordCompatibility }) {
  const logPath = ['.docx', '.odt'].includes(extname(output).toLowerCase())
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
  writeOutputSafely(logPath, lines.join('\n'));
  return logPath;
}

main().catch((err) => {
  process.stderr.write(`md2nativedocx: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
