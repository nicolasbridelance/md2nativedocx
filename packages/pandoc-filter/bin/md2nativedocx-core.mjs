#!/usr/bin/env node
/**
 * Thin CLI bridge between the Pandoc Lua filter and the core engine.
 *
 * Reads Mermaid flowchart text from a file path given as argv[1] (or stdin if
 * no argument), writes the OOXML/DrawingML XML string to stdout. This keeps the
 * Lua filter free of any shell-string interpolation of diagram text (AGENTS.md
 * rule #4): the filter invokes this binary with a fixed argument array and the
 * diagram text lives in a temp file, never in a shell string.
 *
 * Usage: md2nativedocx-core.mjs <diagram.mmd> > diagram.xml
 */

import { readFileSync } from 'node:fs';
import { parseMermaid } from '@md2nativedocx/core';
import { layout } from '@md2nativedocx/core';
import { translateToOoxml } from '@md2nativedocx/core';

const inputPath = process.argv[2];
const input = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');

try {
  const { ast } = parseMermaid(input);
  const result = layout(ast);
  process.stdout.write(translateToOoxml(ast, result));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`md2nativedocx: ${message}\n`);
  process.exit(1);
}
