// Unclosed ```mermaid fence detection (TODO §R1.5). Pandoc turns an unterminated fence into a code block
// running to the end of the file, without any warning: the diagram and everything after it silently stop
// being converted. This is a pre-Pandoc check so the export log can say so.
//
// Mirrors `packages/vscode-extension/src/mermaidBlocks.ts` (`findUnclosedMermaidFences`): the extension
// is TypeScript and bundles this package as a vendored copy, so the few lines are kept in both places.

const ANY_FENCE = /^(`{3,}|~{3,})/;
const OPEN_MERMAID = /^(`{3,})\s*mermaid\s*$/i;

/**
 * Lines (1-based) of every ```mermaid fence that is never closed.
 * Other fenced blocks are skipped wholesale, as Pandoc does, so a mermaid fence shown inside a longer
 * ````-fenced example is not reported.
 * @param {string} text
 * @returns {number[]}
 */
export function findUnclosedMermaidFenceLines(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const unclosed = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    const mermaid = OPEN_MERMAID.exec(trimmed);
    const marker = mermaid?.[1] ?? ANY_FENCE.exec(trimmed)?.[1];
    if (!marker) continue;
    const close = new RegExp(`^${marker}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test((lines[j] ?? '').trim())) j++;
    if (j >= lines.length) {
      // An unterminated fence runs to the end of the file: nothing after it is parsed either.
      if (mermaid) unclosed.push(i + 1);
      break;
    }
    i = j;
  }
  return unclosed;
}

/**
 * Export-log warnings for every unclosed ```mermaid fence in `text`.
 * @param {string} text
 * @returns {string[]}
 */
export function unclosedFenceWarnings(text) {
  return findUnclosedMermaidFenceLines(text).map(
    (line) => `warning: line ${line}: the \`\`\`mermaid block is never closed, so Pandoc treats everything from there to the end of the file as plain code and no diagram is converted. Add a closing \`\`\` line.`,
  );
}
