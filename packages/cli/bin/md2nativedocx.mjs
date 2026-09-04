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
 * Security (AGENTS.md):
 *   * Rule #4: Pandoc is invoked via execFile with an argument array — never a
 *     shell string that interpolates a file path.
 *   * Path traversal: input/output paths are resolved and validated against the
 *     expected root before any file operation.
 *   * Errors are typed (ParseError/TranslationError) and mapped to exit codes.
 */

import { execFile } from 'node:child_process';
import { resolve, isAbsolute, dirname, basename, join, extname } from 'node:path';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { postProcessDocx, injectSmartArtParts } from '../src/postprocess.mjs';

// The pandoc-filter package may be hoisted to the repo root node_modules (npm
// workspaces) or nested under packages/cli/node_modules. Resolve whichever
// exists.
const FILTER_CANDIDATES = [
  fileURLToPath(new URL('../node_modules/@md2nativedocx/pandoc-filter/md2nativedocx.lua', import.meta.url)),
  fileURLToPath(new URL('../../../node_modules/@md2nativedocx/pandoc-filter/md2nativedocx.lua', import.meta.url)),
];
const FILTER_PATH = FILTER_CANDIDATES.find((p) => existsSync(p))
  ?? FILTER_CANDIDATES[0];

// Custom reference.docx (Word's current default look -- Aptos font scheme,
// modern "Office" theme colors, non-bold flat heading hierarchy) instead of
// Pandoc's own bundled default, which is still the original 2007-2010 Office
// theme (Calibri/Cambria mix, bold colored headings) verbatim. See
// packages/cli/assets/README.md for how it was built and what it changes.
const REFERENCE_DOC_PATH = fileURLToPath(new URL('../assets/reference.docx', import.meta.url));

// MD2NATIVEDOCX_REFERENCE_DOC lets a caller (the VS Code extension's
// `md2nativedocx.referenceDocument` setting — mirrors Pandoc's own
// `--reference-doc`) point Pandoc at a company/corporate template instead of
// this package's bundled default above. Unset for standalone `npx
// md2nativedocx` usage, which is unaffected.
const referenceDocOverride = process.env.MD2NATIVEDOCX_REFERENCE_DOC;
const EFFECTIVE_REFERENCE_DOC_PATH =
  referenceDocOverride && existsSync(referenceDocOverride) ? referenceDocOverride : REFERENCE_DOC_PATH;

const USAGE = `Usage: md2nativedocx <input.md> -o <output.docx> [options]

Options:
  -o, --output <file>   Output .docx path (required)
  -h, --help            Show this help
`;

/** Typed error for CLI-level failures. */
class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/** Resolve and validate a path (anti path traversal via `..`). */
function resolveSafePath(rawPath, cwd) {
  const abs = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  // Reject relative paths that escape the working directory via `..`.
  if (!isAbsolute(rawPath)) {
    const root = resolve(cwd);
    if (!abs.startsWith(root + '/') && abs !== root) {
      throw new CliError(`Path escapes the working directory: ${rawPath}`, 2);
    }
  }
  return abs;
}

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

  // Validate paths (anti path traversal).
  const input = resolveSafePath(args.input, cwd);
  const output = resolveSafePath(args.output, cwd);
  if (!existsSync(input)) {
    process.stderr.write(`Input file not found: ${args.input}\n`);
    process.exit(1);
  }

  // Invoke Pandoc via execFile with an argument array (rule #4).
  const pandocArgs = [
    input,
    '-o',
    output,
    '--lua-filter',
    FILTER_PATH,
  ];
  if (existsSync(EFFECTIVE_REFERENCE_DOC_PATH)) {
    pandocArgs.push('--reference-doc', EFFECTIVE_REFERENCE_DOC_PATH);
  }

  // MD2NATIVEDOCX_PANDOC_BIN lets a caller (the VS Code extension's automatic
  // Pandoc provisioning, see packages/vscode-extension/src/pandocProvisioner.ts)
  // point at a specific Pandoc binary instead of relying on PATH. Unset for
  // standalone `npx md2nativedocx` usage, which is unaffected.
  const pandocBin = process.env.MD2NATIVEDOCX_PANDOC_BIN || 'pandoc';

  // SmartArt defaults to OFF (flipped 2026-09-03): a real-Word test of
  // `cycle.ts`'s output on the simplest possible input (a 3-node cycle)
  // failed to open at all ("erreur lors de l'ouverture du fichier") —
  // `chain`/`tree`/`cycle` had only ever been verified under headless
  // LibreOffice, which is known (TODO.md's `mc:Ignorable` incident) not to
  // imply Word can open the file. See `docs/markdown-mermaid-compliance-table.md`
  // §2 point 5. MD2NATIVEDOCX_ENABLE_SMARTART is the opt-in for the VS Code
  // extension's `md2nativedocx.smartArt.enabled` setting (also now
  // default-off) or standalone experimentation.
  // MD2NATIVEDOCX_DISABLE_SMARTART is kept working (now redundant with the
  // default, but explicit and harmless) for anything still setting it.
  const smartArtEnabled =
    process.env.MD2NATIVEDOCX_DISABLE_SMARTART !== '1' && process.env.MD2NATIVEDOCX_ENABLE_SMARTART === '1';

  // A scratch directory the core bridge (spawned by the Lua filter, once per
  // ```mermaid block) uses to hand SmartArt-eligible diagram parts back to
  // this process — see postprocess.mjs's injectSmartArtParts doc comment for
  // why this indirection exists (Pandoc's Lua filter API cannot add .docx
  // package parts/relationships itself). Created whenever SmartArt isn't
  // disabled: the cost of an unused empty temp dir is negligible, and it
  // keeps this code path identical whether or not any block turns out
  // eligible.
  const smartArtDir = smartArtEnabled ? mktempSmartArtDir() : null;
  const pandocEnv = smartArtDir
    ? { ...process.env, MD2NATIVEDOCX_SMARTART_DIR: smartArtDir }
    : { ...process.env };

  execFile(pandocBin, pandocArgs, { cwd, env: pandocEnv }, (err, stdout, stderr) => {
    try {
      if (err) {
        process.stderr.write(`md2nativedocx: Pandoc failed (exit ${err.code ?? '?'})\n`);
        if (stderr) process.stderr.write(stderr);
        process.exit(1);
      }
      try {
        // Post-process the .docx to declare the extended OOXML namespaces on
        // the document root (wpc/wpg/wps/wp14/mc) and renumber drawing ids —
        // without this, Word does not recognize the drawing and drops it
        // (compatibility mode). Must run before injectSmartArtParts, which
        // reads the namespace-fixed/id-renumbered document.xml this writes.
        postProcessDocx(output);
        // Complete the SmartArt wiring for any diagram the core bridge
        // dispatched to it (no-op if none did, and skipped entirely when
        // SmartArt is disabled — nothing could have been dispatched).
        if (smartArtDir) injectSmartArtParts(output, smartArtDir);
      } catch (postErr) {
        process.stderr.write(`md2nativedocx: post-processing failed: ${postErr instanceof Error ? postErr.message : String(postErr)}\n`);
        process.exit(1);
      }

      // Every `md2nativedocx-core.mjs` invocation (one per ```mermaid block,
      // spawned by the Lua filter) writes non-fatal notices to its own
      // stderr, prefixed `md2nativedocx: ` — parser warnings and SmartArt
      // fallback failures alike. Those child processes inherit Pandoc's own
      // stderr fd, so they end up here in Pandoc's captured `stderr`
      // alongside anything Pandoc itself printed. Surface them: never leave
      // a successful export silently hiding something the author should
      // know about.
      const warnings = extractWarnings(stderr);
      const logPath = writeExportLog({ input, output, warnings, rawStderr: stderr });
      if (warnings.length > 0) {
        process.stdout.write(`Warnings: ${warnings.length} (see ${basename(logPath)})\n`);
        for (const warning of warnings) process.stderr.write(`${warning}\n`);
      }
      process.stdout.write(`Wrote ${basename(output)}\n`);
    } finally {
      if (smartArtDir) rmSync(smartArtDir, { recursive: true, force: true });
    }
  });
}

/** Lines this project itself wrote to stderr (`md2nativedocx: ...`) — as
 * opposed to Pandoc's own diagnostics, which share the same stream but
 * aren't ours to count as "warnings". */
function extractWarnings(stderrText) {
  if (!stderrText) return [];
  return stderrText.split('\n').filter((line) => line.startsWith('md2nativedocx: ') && line.trim().length > 0);
}

/** Write a plain-text log next to the output .docx (same basename, `.log`
 * extension) so a click-right export (no VS Code Problems panel in view) has
 * somewhere durable to point to — spec §10, "surface warnings". Written on
 * every successful export, not just when there are warnings, for a
 * consistent, discoverable location. */
function writeExportLog({ input, output, warnings, rawStderr }) {
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
  if (rawStderr && rawStderr.trim().length > 0) {
    lines.push('--- Raw Pandoc/tool output ---', rawStderr.trimEnd(), '');
  }
  writeFileSync(logPath, lines.join('\n'), 'utf8');
  return logPath;
}

/** A fresh, empty temp directory for this run's SmartArt part hand-off. */
function mktempSmartArtDir() {
  return mkdtempSync(join(tmpdir(), 'md2nativedocx-smartart-'));
}

main().catch((err) => {
  process.stderr.write(`md2nativedocx: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
