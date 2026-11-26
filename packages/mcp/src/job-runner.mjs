/**
 * Child-process side of `runJob`: receives one job, runs it, answers over IPC. Everything that can be slow
 * or pathological (layout, Pandoc) lives here so the server process never blocks on it.
 */

import { writeFile } from 'node:fs/promises';

/** Largest .docx the server will write; a bigger package is refused, not truncated. */
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

const TOOLS = {
  async render_diagram({ source, options }) {
    const { renderDiagram } = await import('@md2nativedocx/core');
    const result = renderDiagram(source, options);
    return {
      kind: result.kind,
      diagramType: result.metadata.diagramType,
      label: result.metadata.label,
      warnings: result.metadata.warnings,
      notes: result.metadata.notes,
      parts: result.parts.map((p) => p.kind),
      fragment: result.fragment,
    };
  },

  async convert_document({ markdown, outputPath, cwd, options }) {
    const { convert } = await import('@md2nativedocx/cli');
    // Always sandboxed, set last so no request option can turn it off: the Markdown comes from a model or
    // whoever feeds it, and Pandoc would otherwise read any image path, URL or network share it names.
    const result = await convert(markdown, { ...options, cwd, sandbox: true });
    if (result.document.length > MAX_DOCUMENT_BYTES) {
      throw new Error(`the document is ${result.document.length} bytes, over the ${MAX_DOCUMENT_BYTES} byte limit`);
    }
    // 'wx': never overwrite a file the caller did not create; the parent already validated the path.
    await writeFile(outputPath, result.document, { flag: 'wx' });
    // `warnings` as lines to read, `diagnostics` as data: each problem with its diagram number and line.
    // `notes`: placed the same way, but nothing to fix (a correct flowchart drawn as shapes, not SmartArt).
    return { outputPath, bytes: result.document.length, warnings: result.warnings, diagnostics: result.diagnostics, notes: result.notes };
  },
};

process.once('message', async (job) => {
  try {
    const run = Object.hasOwn(TOOLS, job?.tool) ? TOOLS[job.tool] : undefined;
    if (!run) throw new Error(`unknown job: ${String(job?.tool)}`);
    const result = await run(job.args);
    process.send({ ok: true, result }, () => process.exit(0));
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    process.send({ ok: false, name: e.name, message: e.message }, () => process.exit(0));
  }
});
// The server went away: do not outlive it.
process.on('disconnect', () => process.exit(1));
