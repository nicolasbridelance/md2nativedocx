#!/usr/bin/env node
/**
 * md2nativedocx CLI.
 *
 * `npx md2nativedocx rapport.md -o rapport.docx` packages the Pandoc invocation
 * with the md2nativedocx Lua filter, producing a .docx with native, editable
 * OOXML vector shapes for every ```mermaid block.
 *
 * Security (AGENTS.md):
 *   * Rule #4: Pandoc is invoked via execFile with an argument array — never a
 *     shell string that interpolates a file path.
 *   * Path traversal: input/output paths are resolved and validated against the
 *     expected root before any file operation.
 *   * Errors are typed (ParseError/TranslationError) and mapped to exit codes.
 */

import { execFile } from 'node:child_process';
import { resolve, isAbsolute, dirname, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The pandoc-filter package may be hoisted to the repo root node_modules (npm
// workspaces) or nested under packages/cli/node_modules. Resolve whichever
// exists.
const FILTER_CANDIDATES = [
  fileURLToPath(new URL('../node_modules/@md2nativedocx/pandoc-filter/md2nativedocx.lua', import.meta.url)),
  fileURLToPath(new URL('../../../node_modules/@md2nativedocx/pandoc-filter/md2nativedocx.lua', import.meta.url)),
];
const FILTER_PATH = FILTER_CANDIDATES.find((p) => existsSync(p))
  ?? FILTER_CANDIDATES[0];

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

  execFile('pandoc', pandocArgs, { cwd }, (err, stdout, stderr) => {
    if (err) {
      process.stderr.write(`md2nativedocx: Pandoc failed (exit ${err.code ?? '?'})\n`);
      if (stderr) process.stderr.write(stderr);
      process.exit(1);
    }
    process.stdout.write(`Wrote ${basename(output)}\n`);
  });
}

main().catch((err) => {
  process.stderr.write(`md2nativedocx: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
