/**
 * The MCP server: two thin tools over the public API (spec 01 §11). No document logic here: each call is
 * validated, handed to `runJob` under a deadline, and its result or typed failure is reported.
 *
 * Security (AGENTS.md): output files are confined to `root` (path traversal row) and never overwrite an
 * existing file; the Markdown and Mermaid text is data passed over IPC, never a command line (rule 4).
 */

import { mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobFailedError, JobTimeoutError, runJob } from './run-job.mjs';

export const DEFAULT_RENDER_TIMEOUT_MS = 30_000;
export const DEFAULT_CONVERT_TIMEOUT_MS = 120_000;
const MAX_MARKDOWN_LENGTH = 5_000_000;

/** An argument the server refuses before running anything. */
export class ToolInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/**
 * Resolve `rawPath` against `root` and require the result to stay inside it, symlinks in the existing
 * part of the path included. Only `.docx` files are written.
 */
export async function resolveOutputPath(rawPath, root) {
  if (!/\.docx$/i.test(rawPath)) throw new ToolInputError('outputPath must end in .docx');
  const realRoot = await realpath(root);
  const target = resolve(realRoot, rawPath);
  const rel = relative(realRoot, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new ToolInputError(`outputPath must stay inside ${realRoot}`);
  }
  await mkdir(dirname(target), { recursive: true });
  // Re-check after creating directories: a symlinked directory would resolve outside the root.
  const realDir = await realpath(dirname(target));
  if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
    throw new ToolInputError(`outputPath must stay inside ${realRoot}`);
  }
  return resolve(realDir, basename(target));
}

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function failure(err) {
  let message;
  if (err instanceof JobTimeoutError || err instanceof ToolInputError) message = `${err.name}: ${err.message}`;
  else if (err instanceof JobFailedError) message = `${err.kind}: ${err.message}`;
  else message = `Error: ${err instanceof Error ? err.message : String(err)}`;
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * @param {{ root: string, renderTimeoutMs?: number, convertTimeoutMs?: number, runnerPath?: string }} config
 *   `root`: the only directory `convert_document` writes into, and Pandoc's working directory.
 */
export function createServer({
  root,
  renderTimeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
  convertTimeoutMs = DEFAULT_CONVERT_TIMEOUT_MS,
  runnerPath,
}) {
  const server = new McpServer({ name: 'md2nativedocx', version: '0.1.0' });
  const runnerOption = runnerPath === undefined ? {} : { runnerPath };

  server.registerTool(
    'render_diagram',
    {
      description:
        'Render one Mermaid diagram as editable Word shapes, SmartArt or a native chart, and report what was ' +
        'detected, any warnings, and (on request) the WordprocessingML fragment. Use it to check that a diagram ' +
        'converts before putting it in a document. Refuses diagrams over 500 nodes or 800 edges.',
      inputSchema: {
        source: z.string().min(1).max(1_000_000).describe('Mermaid source, without the ``` fence'),
        smartArt: z.boolean().optional().describe('Allow SmartArt for diagrams that can be one'),
        nativeCharts: z.boolean().optional().describe('Allow native Word charts for pie / xychart / radar'),
        includeFragment: z.boolean().optional().describe('Include the XML fragment (large). Default false'),
      },
    },
    async ({ source, smartArt, nativeCharts, includeFragment }) => {
      try {
        const options = {
          ...(smartArt !== undefined ? { smartArt } : {}),
          ...(nativeCharts !== undefined ? { nativeCharts } : {}),
        };
        const result = await runJob(
          { tool: 'render_diagram', args: { source, options } },
          { timeoutMs: renderTimeoutMs, ...runnerOption },
        );
        const { fragment, ...summary } = result;
        return text(includeFragment === true ? { ...summary, fragment } : { ...summary, fragmentLength: fragment.length });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'convert_document',
    {
      description:
        'Convert a Markdown document to a .docx where every ```mermaid block is an editable Word diagram. ' +
        'Writes the file under the server root (never overwrites) and returns its path. Needs Pandoc on the server.',
      inputSchema: {
        markdown: z.string().min(1).max(MAX_MARKDOWN_LENGTH).describe('The Markdown document'),
        outputPath: z.string().min(1).max(512).describe('Relative path of the .docx to create, inside the server root'),
        toc: z.boolean().optional().describe('Add a table of contents'),
        smartArt: z.boolean().optional().describe('SmartArt for diagrams that can be one (default true)'),
      },
    },
    async ({ markdown, outputPath, toc, smartArt }) => {
      try {
        const target = await resolveOutputPath(outputPath, root);
        const options = {
          ...(toc !== undefined ? { toc } : {}),
          ...(smartArt !== undefined ? { smartArt } : {}),
        };
        const result = await runJob(
          { tool: 'convert_document', args: { markdown, outputPath: target, cwd: await realpath(root), options } },
          { timeoutMs: convertTimeoutMs, ...runnerOption },
        );
        return text(result);
      } catch (err) {
        return failure(err);
      }
    },
  );

  return server;
}
