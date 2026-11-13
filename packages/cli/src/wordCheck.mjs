// Word compatibility check (ADR 0007 part D, TODO §R1.4). Validates the generated `.docx` against the
// schema real Word enforces (Open XML SDK) and says, part by part, what was actually checked. It never
// claims an effect on how Word opens the file: the validator cannot know that.
import { execFileSync } from 'node:child_process';

/** Pandoc release the "known Pandoc" signatures below were recorded against (2026-11-13). */
export const PANDOC_SIGNATURES_VERSION = '3.1.3';

// Parts only this project writes (diagrams, charts and their embedded workbooks).
const OWN_PARTS = ['/word/diagrams/', '/word/charts/', '/word/embeddings/'];
// Elements inside `word/document.xml` that only this project writes: the inline drawing canvas, its
// shapes, the SmartArt/chart frames and the alternate-content wrappers around them.
const OWN_PATH = /\/(wpc|wps|wp|a|pic|dgm|c|mc|w14|wp14):|\/w:drawing\b/;

/**
 * Known noise from Pandoc's own `.docx` writer: a closed list of signatures, each pinned to a part and to
 * the shape of the validator message. Anything not matching is reported as an error.
 * @type {ReadonlyArray<{ name: string, part: string, path: RegExp, description?: RegExp }>}
 */
const PANDOC_SIGNATURES = [
  { name: 'syntax-highlighting styles', part: '/word/styles.xml', path: /\/w:style\[\d+\]\/w:rPr\[1\]$/, description: /unexpected child element/ },
  { name: 'list numbering ids (w:nsid)', part: '/word/numbering.xml', path: /\/w:nsid\[1\]$/ },
  { name: 'settings (w:doNotTrackMoves)', part: '/word/settings.xml', path: /^\/w:settings\[1\]$/, description: /doNotTrackMoves/ },
  { name: 'table properties', part: '/word/document.xml', path: /\/w:tbl\[\d+\]\/(w:tblPr\[1\](\/w:jc\[1\])?|w:tr\[\d+\]\/w:trPr\[1\]\/w:tblHeader\[1\])$/ },
  { name: 'list paragraph properties', part: '/word/document.xml', path: /^\/w:document\[1\]\/w:body\[1\]\/w:p\[\d+\]\/w:pPr\[1\]$/, description: /unexpected child element .*pStyle/ },
];

/**
 * Sort validator errors into what this project writes, Pandoc's known noise, and everything else.
 * Own output wins over a known signature, so a diagram error can never be hidden as Pandoc noise.
 *
 * @param {ReadonlyArray<{ Part?: string, Path?: string, Description?: string }>} errors
 * @returns {{ own: object[], pandoc: object[], other: object[] }}
 */
export function classifyValidatorErrors(errors) {
  const own = [];
  const pandoc = [];
  const other = [];
  for (const e of errors) {
    const part = e.Part ?? '';
    const path = e.Path ?? '';
    if (OWN_PARTS.some((p) => part.startsWith(p)) || (part === '/word/document.xml' && OWN_PATH.test(path))) {
      own.push(e);
    } else if (PANDOC_SIGNATURES.some((sig) => sig.part === part && sig.path.test(path) && (!sig.description || sig.description.test(e.Description ?? '')))) {
      pandoc.push(e);
    } else {
      other.push(e);
    }
  }
  return { own, pandoc, other };
}

/** @param {string} stdout */
function parseReport(stdout) {
  const report = JSON.parse(stdout.trim().split('\n').pop());
  if (!Array.isArray(report.errors)) throw new TypeError('validator report has no errors list');
  return { ran: true, ...classifyValidatorErrors(report.errors) };
}

/**
 * Run the validator on `docxPath` when `MD2NATIVEDOCX_OXML_VALIDATOR_DLL` is set.
 *
 * Never throws: an export that already succeeded must never be reported as failed because this
 * optional check could not run. Returns `null` when off, `{ ran: true, own, pandoc, other }`, or
 * `{ ran: false, reason }`.
 * @param {string} docxPath
 */
export function runWordCompatibilityCheck(docxPath) {
  const dllPath = process.env.MD2NATIVEDOCX_OXML_VALIDATOR_DLL;
  if (!dllPath) return null;
  const dotnetBin = process.env.MD2NATIVEDOCX_DOTNET_BIN || 'dotnet';
  try {
    return parseReport(execFileSync(dotnetBin, [dllPath, docxPath, '--json'], { encoding: 'utf8' }));
  } catch (err) {
    // A non-zero exit (errorCount > 0) still wrote the JSON report to stdout first.
    const stdout = err?.stdout?.toString();
    if (stdout) {
      try {
        return parseReport(stdout);
      } catch {
        // Not a usable report: fall through to the "could not run" case.
      }
    }
    return { ran: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** @param {{ Path?: string, Description?: string }} e */
const errorLine = (e) => `  - ${e.Path}: ${e.Description}`;

/**
 * Render a check result as `.log` lines: one statement per part of the document, saying what was
 * validated and what was found, never what Word will do.
 * @param {ReturnType<typeof runWordCompatibilityCheck>} result
 * @returns {string[]}
 */
export function formatWordCompatibility(result) {
  if (result === null) {
    return ['Not checked (md2nativedocx.wordCompatibilityCheck is off, or this is a standalone CLI export).'];
  }
  if (!result.ran) return [`Not checked (could not run: ${result.reason}).`];

  const lines = [];
  lines.push(
    result.own.length === 0
      ? 'Diagrams and charts (written by md2nativedocx): no schema error found.'
      : `Diagrams and charts (written by md2nativedocx): ${result.own.length} schema error(s):`,
    ...result.own.map(errorLine),
  );
  const rest = [];
  if (result.pandoc.length > 0) {
    const names = [...new Set(PANDOC_SIGNATURES.filter((sig) => result.pandoc.some((e) => e.Part === sig.part && sig.path.test(e.Path ?? ''))).map((sig) => sig.name))];
    rest.push(`${result.pandoc.length} known schema deviation(s) written by Pandoc itself (${names.join('; ')}; signatures recorded with Pandoc ${PANDOC_SIGNATURES_VERSION}).`);
  }
  if (result.other.length > 0) {
    rest.push(`${result.other.length} other schema error(s):`);
  }
  lines.push(
    rest.length === 0 ? 'Rest of the document (written by Pandoc): no schema error found.' : `Rest of the document (written by Pandoc): ${rest.shift()}`,
    ...rest,
    ...result.other.map(errorLine),
  );
  lines.push('This is a validation against the Open XML schema; it does not predict how Word will behave.');
  return lines;
}
