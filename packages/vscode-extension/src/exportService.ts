import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { blockAtLine, parseMermaidBlocks, wrapBlockAsDocument, type MermaidBlock } from './mermaidBlocks';

export interface ExportResult {
  outputPath: string;
}

export class PandocMissingError extends Error {}
export class ExportFailedError extends Error {
  constructor(
    message: string,
    public readonly details: string,
  ) {
    super(message);
  }
}

/** Resolve the real CLI's bin script by locating the workspace package on
 * disk (rule #4, AGENTS.md: fixed subprocess argument array, no shell
 * interpolation) — the extension bundles no logic of its own, it packages
 * the same `@md2nativedocx/cli` invocation used by the tests and the corpus
 * generator. */
function resolveCliBin(): string {
  const pkgJsonPath = require.resolve('@md2nativedocx/cli/package.json');
  return join(dirname(pkgJsonPath), 'bin', 'md2nativedocx.mjs');
}

function runCli(input: string, output: string, cwd: string): Promise<void> {
  const cliBin = resolveCliBin();
  return new Promise((resolve, reject) => {
    execFile('node', [cliBin, input, '-o', output], { cwd, encoding: 'utf8' }, (err, _stdout, stderrRaw) => {
      if (!err) {
        resolve();
        return;
      }
      const stderr = String(stderrRaw ?? '');
      if (stderr.includes('ENOENT')) {
        reject(new PandocMissingError('Pandoc est introuvable sur cette machine.'));
        return;
      }
      const firstLine = stderr.trim().split('\n')[0] || err.message;
      reject(new ExportFailedError(`Échec de l'export : ${firstLine}`, stderr || err.message));
    });
  });
}

/** Where to write a generated `.docx`, honouring `md2nativedocx.outputDirectory`
 * (empty = same folder as the source, the zero-config default). */
export function resolveOutputPath(sourcePath: string, outputBaseName: string, outputDirectory: string): string {
  const dir = outputDirectory.trim() || dirname(sourcePath);
  return join(dir, `${outputBaseName}.docx`);
}

export async function exportDocument(sourcePath: string, outputDirectory: string): Promise<ExportResult> {
  const outputPath = resolveOutputPath(sourcePath, basename(sourcePath, '.md'), outputDirectory);
  await runCli(sourcePath, outputPath, dirname(sourcePath));
  return { outputPath };
}

/** Export a single mermaid block by wrapping it in a minimal standalone
 * Markdown envelope (title + one ```mermaid block) — same shape as
 * `scripts/generate-corpus.mjs`'s `wrapMarkdown` — and running it through the
 * real CLI, so this exercises no logic the corpus tests don't already cover. */
export async function exportBlock(
  sourcePath: string,
  sourceText: string,
  blockIndex: number,
  outputDirectory: string,
): Promise<ExportResult> {
  const blocks = parseMermaidBlocks(sourceText);
  const block = blocks.find((b) => b.index === blockIndex);
  if (!block) {
    throw new ExportFailedError('Ce bloc mermaid est introuvable — le document a peut-être changé.', '');
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-block-'));
  try {
    const tmpMd = join(tmpDir, 'diagram.md');
    writeFileSync(tmpMd, wrapBlockAsDocument(block));
    const outputBaseName = `${basename(sourcePath, '.md')}-diagram-${blockIndex + 1}`;
    const outputPath = resolveOutputPath(sourcePath, outputBaseName, outputDirectory);
    await runCli(tmpMd, outputPath, dirname(sourcePath));
    return { outputPath };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Resolve which block a palette-invoked (argument-less) export targets: the
 * block under the cursor if there is one, the sole block if there is exactly
 * one in the document, or `null` if the choice is ambiguous/absent — callers
 * decide how to prompt in that case (kept out of this pure-ish helper so it
 * stays unit-testable without a real editor). */
export function resolveBlockForCursor(sourceText: string, cursorLine: number): MermaidBlock | null {
  const blocks = parseMermaidBlocks(sourceText);
  const atCursor = blockAtLine(blocks, cursorLine);
  if (atCursor) return atCursor;
  return blocks.length === 1 ? (blocks[0] ?? null) : null;
}
