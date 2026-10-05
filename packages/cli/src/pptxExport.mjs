/**
 * `.pptx` branch of the CLI (`md2nativedocx deck.md -o deck.pptx`): one slide per ```mermaid block.
 *
 * Pandoc is not involved: `@md2nativedocx/pptx` rewrites the diagram shapes core already produces
 * (see docs/adr/0010-pptx-production-translator-plan.md). Non-diagram Markdown is ignored.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CliError, resolveSafePath } from './cliSupport.mjs';

const USAGE = `Usage: md2nativedocx <input.md> -o <output.pptx> [--show-source]

  --show-source   Put each diagram's Mermaid source in a panel beside it
`;

function parsePptxArgs(argv) {
  const args = { input: null, output: null, showSource: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output') {
      args.output = argv[++i];
      if (!args.output) throw new CliError('Missing value for --output', 2);
    } else if (a === '--show-source') {
      args.showSource = true;
    } else if (a === '-h' || a === '--help') {
      args.help = true;
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

/** Run the deck export; resolves to the process exit code. */
export async function runPptxCli(argv, cwd) {
  try {
    const args = parsePptxArgs(argv);
    if (args.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    if (!args.input) throw new CliError('Missing input file.', 2);
    const input = resolveSafePath(args.input, cwd);
    const output = resolveSafePath(args.output, cwd);
    if (!existsSync(input)) throw new CliError(`Input file not found: ${args.input}`, 1);

    const { exportPptx, PptxConversionError } = await import('@md2nativedocx/pptx');
    let result;
    try {
      result = await exportPptx(readFileSync(input, 'utf8'), { title: basename(input), showSource: args.showSource });
    } catch (err) {
      if (err instanceof PptxConversionError) throw new CliError(`md2nativedocx: ${err.message}`, 1);
      throw err;
    }
    writeFileSync(output, result.buffer);
    if (result.warnings.length > 0) {
      process.stdout.write(`Warnings: ${result.warnings.length}\n`);
      for (const w of result.warnings) process.stderr.write(`md2nativedocx: ${w}\n`);
    }
    process.stdout.write(`Wrote ${basename(output)} (${result.slideCount} slide${result.slideCount === 1 ? '' : 's'})\n`);
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    process.stderr.write(`md2nativedocx: pptx export failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
