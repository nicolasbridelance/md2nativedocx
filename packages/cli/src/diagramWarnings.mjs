// Which diagram each warning is about. The Lua filter writes `md2nativedocx-diagram: <n> <language>` to
// stderr before it runs the bridge on the n-th diagram block, and the bridge's own warnings follow on the
// same stream; this module reads that back into one diagnostic per warning, with the diagram's number and,
// when it can be found for certain, the line of its fence in the Markdown. An agent repairing a document
// then knows which block to change (TODO, « Rapport de conversion exploitable par un agent »).

const MARKER = /^md2nativedocx-diagram: (\d+) (\S+)\s*$/;
const OURS = 'md2nativedocx: ';
const DIAGRAM_LANGUAGES = new Set(['mermaid', 'plantuml', 'puml']);
const FENCE_OPEN = /^(`{3,}|~{3,})\s*(.*)$/;

/**
 * The fence lines (1-based) of the diagram blocks in `text`, in document order, with the language the Lua
 * filter reads: the first class of the block (```` ```mermaid ````, ```` ```{.plantuml} ````), case as written.
 * Content of every fenced block is skipped, as Pandoc does, so a fence shown inside a longer example is not
 * counted. A block Pandoc reads differently (inside a block quote, say) is caught by the count check in
 * {@link diagramDiagnostics}, which then gives no line rather than a wrong one.
 * @param {string} text
 * @returns {Array<{ line: number, language: string }>}
 */
export function findDiagramFences(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const fences = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec((lines[i] ?? '').trim());
    if (!open) continue;
    const marker = open[1] ?? '';
    const info = (open[2] ?? '').trim();
    // A backtick fence's info string cannot hold a backtick (CommonMark); that line is inline code.
    if (marker.startsWith('`') && info.includes('`')) continue;
    const language = firstClass(info);
    if (language !== undefined && DIAGRAM_LANGUAGES.has(language)) fences.push({ line: i + 1, language });
    const close = new RegExp(`^${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test((lines[j] ?? '').trim())) j++;
    i = j;
  }
  return fences;
}

/** The first class of a fence's info string: `mermaid`, or `.mermaid` inside `{...}` attributes. */
function firstClass(info) {
  if (info.startsWith('{')) {
    const attrs = info.slice(1, info.indexOf('}') === -1 ? undefined : info.indexOf('}'));
    return /(?:^|\s)\.([^\s}]+)/.exec(attrs)?.[1];
  }
  return /^([^\s{]+)/.exec(info)?.[1];
}

/**
 * One diagnostic per line this project wrote to stderr (`md2nativedocx: ...`), attributed to the diagram
 * whose marker precedes it. `line` is given only when the fences found in `sourceText` match, one for one
 * and language for language, the diagrams the filter saw.
 * @param {string} stderrText
 * @param {string | undefined} sourceText the Markdown, when readable
 * @returns {Array<import('./convert.d.mts').ConversionDiagnostic>}
 */
export function diagramDiagnostics(stderrText, sourceText) {
  const entries = [];
  const seen = [];
  /** @type {{ index: number, language: string } | undefined} */
  let current;
  for (const raw of stderrText.split(/\r?\n/)) {
    const marker = MARKER.exec(raw);
    if (marker) {
      current = { index: Number(marker[1]), language: marker[2] ?? '' };
      seen.push(current);
      continue;
    }
    if (!raw.startsWith(OURS) || raw.trim().length === 0) continue;
    const message = raw.slice(OURS.length).replace(/^warning:\s*/, '');
    entries.push(current ? { message, diagram: current.index, language: current.language } : { message });
  }
  const fences = sourceText === undefined ? [] : findDiagramFences(sourceText);
  const linesTrusted = fences.length === seen.length && seen.every((d, k) => fences[k]?.language === d.language);
  if (!linesTrusted) return entries;
  return entries.map((e) => (e.diagram === undefined ? e : { ...e, line: fences[e.diagram - 1]?.line }));
}

/**
 * A diagnostic as one warning line: its place first (`diagram 2, line 14: ...`), as the export log and the
 * CLI print it.
 * @param {import('./convert.d.mts').ConversionDiagnostic} d
 * @returns {string}
 */
export function formatDiagnostic(d) {
  const place = [d.diagram !== undefined ? `diagram ${d.diagram}` : undefined, d.line !== undefined ? `line ${d.line}` : undefined]
    .filter(Boolean)
    .join(', ');
  return `warning: ${place ? `${place}: ` : ''}${d.message}`;
}
