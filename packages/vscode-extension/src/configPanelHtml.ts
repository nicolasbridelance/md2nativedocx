/**
 * Pure HTML builder for the Lot 4 configuration panel
 * (`docs/specs/export_customization_SPEC.md` §3) — no `vscode` import, so it
 * is unit-testable in plain `node:test` without an Extension Development
 * Host, same split as `mermaidBlocks.ts`'s parsing logic vs. `extension.ts`'s
 * vscode-facing glue.
 *
 * Scope (confirmed in this session, see TODO.md's Lot 4 entry): only the
 * settings Lots 1-3 and 5 actually shipped are exposed — table-style/
 * heading-numbering (1.11/1.12) still have no settings to expose, so no
 * dead toggle is built for them (would violate UX_SPEC.md's "zero
 * unnecessary configuration" principle). "Tableaux en paysage" (1.9, Lot 5)
 * was in that same no-control category when this file was first written,
 * added to the Mise en page group once the setting existed.
 *
 * 2026-09-06 redesign (maintainer feedback after the Lot 1-5 pass): each
 * group is now a collapsible `<details>` (closed by default) instead of a
 * flat always-visible list, with a "Réglages rapides" macro row above them
 * (font/page presets, accent color swatches) and a reset control per section
 * plus one global "Tout réinitialiser". Font fields (`headingFont`/
 * `bodyFont`) became a curated dropdown with a "Personnalisé…" escape hatch
 * (never a validated list — this project cannot know which fonts are
 * actually installed on the machine that will later open the `.docx` in
 * Word, so the dropdown is a suggestion, not a guarantee). Deliberately
 * *not* built here: a settable color for diagram subgraph boxes — that
 * touches `packages/core`'s public translator API, the same escalation
 * category as `maxDrawingCx`/`maxDrawingCy` before it (see TODO.md's Phase 8
 * follow-up list).
 *
 * Security: `headingFont`/`bodyFont`/`accentColor`/`tableHeaderColor`/
 * `referenceDocument` are free-text settings a user can type anything into
 * — every one of them reaches this HTML as an attribute or text value and
 * must be escaped ({@link escapeHtmlAttr}/{@link escapeHtmlText}), the same
 * non-negotiable rule this project already applies to user text reaching
 * XML output.
 */

export interface ConfigState {
  pageSize: string;
  orientation: string;
  margins: string;
  marginsCustomTop: number;
  marginsCustomRight: number;
  marginsCustomBottom: number;
  marginsCustomLeft: number;
  footerPageNumber: boolean;
  landscapeTables: boolean;
  headingFont: string;
  bodyFont: string;
  fontSize: number;
  lineSpacing: string;
  justify: string;
  accentColor: string;
  /** Background color of a table's header row, 6 hex digits or `''` (no
   * fill — the template's own plain header). New alongside this redesign;
   * `accentColor` itself now also recolors headings/hyperlinks (a real
   * pre-existing bug fixed the same session: their literal `w:val` color
   * fallback was never patched, only `theme1.xml`'s `a:accent1` — invisible
   * under LibreOffice, and not guaranteed honored by every Word version
   * either, so `referenceDocBuilder.mjs` now patches both). */
  tableHeaderColor: string;
  tocEnabled: boolean;
  tocDepth: number;
  emojiForceColorFont: boolean;
  /** ADR 0007 part D — validates the generated `.docx` against Word's own
   * schema and reports the result in the export's `.log`. Never greyed by
   * a custom reference doc (works regardless, same category as TOC/emoji). */
  wordCompatibilityCheckEnabled: boolean;
  /** The effective `md2nativedocx.referenceDocument` value, `''` if unset.
   * Non-empty greys out every Lot 1 layout/typography control (spec §2.1/
   * §3.2 "Avancé" — confirmed with the maintainer alongside option (a)). */
  referenceDocument: string;
  /** Which `vscode.ConfigurationTarget` panel edits write to. */
  scope: 'user' | 'workspace';
}

const HTML_ATTR_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtmlAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ATTR_ESCAPES[ch] ?? ch);
}

export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>]/g, (ch) => HTML_ATTR_ESCAPES[ch] ?? ch);
}

/** Strip the light markdown `package.nls.json` descriptions use (code
 * spans, `#setting.key#` cross-references, `[text](url)` links) down to
 * plain text for a native `title` tooltip — real markdown rendering in an
 * HTML `title` attribute isn't possible, this just avoids literal
 * backticks/brackets showing up in the tooltip. */
export function stripLightMarkdown(markdown: string): string {
  return markdown
    .replace(/`([^`]*)`/g, '$1')
    .replace(/#([\w.]+)#/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/** Looks up the exact string `package.nls.json` already declares for a
 * setting's `markdownDescription` — the single source of truth `contributes.
 * configuration` and this panel both read, so the two surfaces can never
 * drift apart (spec §3.2, "ne pas dupliquer de texte"). */
export type Describe = (settingPath: string) => string;

function tooltip(describe: Describe, settingPath: string): string {
  return escapeHtmlAttr(stripLightMarkdown(describe(settingPath)));
}

interface RowOptions {
  label: string;
  settingPath: string;
  control: string;
  describe: Describe;
  /** Grey out (and disable) this row when a custom reference document is
   * set — true for every Lot 1 layout/typography control, false for
   * TOC/emoji (spec §2.1 conflict rule only applies to the former). */
  greyWhenCustomRef: boolean;
  hasCustomRef: boolean;
  /** Extra class(es) on the row `<div>`, e.g. `'color-row'`. */
  extraClass?: string;
}

function row({ label, settingPath, control, describe, greyWhenCustomRef, hasCustomRef, extraClass }: RowOptions): string {
  const greyed = greyWhenCustomRef && hasCustomRef;
  const cls = ['row', extraClass, greyed ? 'greyed' : null].filter(Boolean).join(' ');
  return (
    `<div class="${cls}" title="${tooltip(describe, settingPath)}">` +
    `<label>${escapeHtmlText(label)}</label>${control}</div>`
  );
}

function select(key: string, current: string, options: readonly string[], disabled: boolean): string {
  const opts = options
    .map((o) => `<option value="${escapeHtmlAttr(o)}"${o === current ? ' selected' : ''}>${escapeHtmlText(o)}</option>`)
    .join('');
  return `<select data-key="${escapeHtmlAttr(key)}"${disabled ? ' disabled' : ''}>${opts}</select>`;
}

function checkbox(key: string, checked: boolean, disabled: boolean): string {
  return `<input type="checkbox" data-key="${escapeHtmlAttr(key)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}/>`;
}

function textInput(key: string, value: string, disabled: boolean, extraAttrs = ''): string {
  return `<input type="text" data-key="${escapeHtmlAttr(key)}" value="${escapeHtmlAttr(value)}"${extraAttrs}${disabled ? ' disabled' : ''}/>`;
}

function numberInput(key: string, value: number, min: number, max: number, step: number, disabled: boolean): string {
  return (
    `<input type="number" data-key="${escapeHtmlAttr(key)}" value="${value}" min="${min}" max="${max}" step="${step}"` +
    `${disabled ? ' disabled' : ''}/>`
  );
}

const PAGE_SIZES = ['A3', 'A4', 'Letter', 'Legal'] as const;
const ORIENTATIONS = ['portrait', 'landscape'] as const;
const MARGINS = ['normal', 'narrow', 'moderate', 'wide', 'custom'] as const;
const LINE_SPACINGS = ['default', 'single', '1.15', '1.5', 'double'] as const;
const JUSTIFY = ['left', 'right', 'center', 'both'] as const;

/** Curated, non-exhaustive font suggestions spanning Word 2007-2025's own
 * built-in theme fonts plus LibreOffice's default substitutes — **not** a
 * validated "these are installed" list (neither this machine's nor, more to
 * the point, the eventual reader's Word install's fonts can be enumerated
 * from a VS Code extension), just a shortcut for the common case. `''` means
 * "leave the template's own default alone", already a meaningful value
 * today, not a placeholder. */
const FONT_CHOICES: readonly { value: string; label: string }[] = [
  { value: '', label: '(par défaut du gabarit)' },
  { value: 'Aptos Display', label: 'Aptos Display' },
  { value: 'Aptos', label: 'Aptos' },
  { value: 'Calibri Light', label: 'Calibri Light' },
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Cambria', label: 'Cambria' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Liberation Sans', label: 'Liberation Sans' },
  { value: 'Liberation Serif', label: 'Liberation Serif' },
  { value: 'Verdana', label: 'Verdana' },
];
const FONT_CUSTOM_SENTINEL = '__custom__';

/** Font "packages" (maintainer's own term): one dropdown pick sets both
 * `headingFont`+`bodyFont` together, matching a recognizable Word/
 * LibreOffice era instead of asking a non-technical user to pick two fonts
 * separately. `office2007` is literally Pandoc's own bundled default theme
 * (`packages/cli/assets/README.md`), `libreoffice` matches the fontconfig
 * substitution this project already pins for `test:visual` — not arbitrary
 * picks. */
const FONT_PRESETS: readonly { id: string; label: string; heading: string; body: string }[] = [
  { id: 'word2025', label: 'Word 2025 / 365 (Aptos) — par défaut', heading: '', body: '' },
  { id: 'word2016', label: 'Word 2016–2021 (Calibri)', heading: 'Calibri Light', body: 'Calibri' },
  { id: 'word2007', label: 'Word 2007–2010 (Cambria / Calibri)', heading: 'Cambria', body: 'Calibri' },
  { id: 'libreoffice', label: 'LibreOffice (Liberation)', heading: 'Liberation Sans', body: 'Liberation Serif' },
];

/** Page/orientation/margins bundled presets for the top macro row. */
const PAGE_PRESETS: readonly { id: string; label: string; pageSize: string; orientation: string; margins: string }[] = [
  { id: 'report-a4', label: 'Rapport standard — A4 portrait', pageSize: 'A4', orientation: 'portrait', margins: 'normal' },
  { id: 'compact-a4', label: 'Compact — A4 portrait, marges étroites', pageSize: 'A4', orientation: 'portrait', margins: 'narrow' },
  { id: 'presentation-a3', label: 'Présentation — A3 paysage', pageSize: 'A3', orientation: 'landscape', margins: 'normal' },
  { id: 'letter', label: 'US Letter portrait', pageSize: 'Letter', orientation: 'portrait', margins: 'normal' },
];

/** The 6 "Office" theme accent colors (`accent1`-`accent6` of Word's own
 * built-in modern theme) — clickable examples for the accent-color/table-
 * header-color pickers, not invented. */
const ACCENT_SWATCHES = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'] as const;

/** VS Code setting paths (relative to `md2nativedocx.`) grouped exactly as
 * the panel's own sections, used both to build each section's "Réinitialiser
 * cette section" button and the top "Tout réinitialiser" button (their
 * union). Kept as one source of truth so a future new setting can't be added
 * to a group's rows without also being added here (a stale reset button that
 * silently misses a setting would be worse than no reset button). */
const GROUP_KEYS = {
  layout: [
    'layout.pageSize',
    'layout.orientation',
    'layout.margins',
    'layout.marginsCustomTop',
    'layout.marginsCustomRight',
    'layout.marginsCustomBottom',
    'layout.marginsCustomLeft',
    'layout.footerPageNumber',
    'layout.landscapeTables',
  ],
  typography: [
    'typography.headingFont',
    'typography.bodyFont',
    'typography.fontSize',
    'typography.lineSpacing',
    'typography.justify',
    'typography.accentColor',
    'typography.tableHeaderColor',
  ],
  structure: ['toc.enabled', 'toc.depth'],
  emoji: ['emoji.forceColorFont'],
  advanced: ['wordCompatibilityCheck.enabled', 'referenceDocument'],
} as const;

const ALL_SETTING_KEYS = Object.values(GROUP_KEYS).flat();

function resetButton(keys: readonly string[], label: string): string {
  return `<button type="button" class="reset-btn" data-reset-keys="${keys.join(',')}">${escapeHtmlText(label)}</button>`;
}

/** A `<details>` section, closed by default (maintainer feedback: macro
 * choices visible up top, detailed per-category controls folded away) with
 * a "Réinitialiser cette section" button in its own `<summary>`. */
function section(title: string, keys: readonly string[], bodyHtml: string): string {
  return (
    `<details class="group"><summary><span>${escapeHtmlText(title)}</span>` +
    `${resetButton(keys, 'Réinitialiser')}</summary><div class="group-body">${bodyHtml}</div></details>`
  );
}

/** A dropdown of {@link FONT_CHOICES} plus "Personnalisé…", paired with a
 * manual text input revealed only when the current value isn't one of the
 * curated choices (or the user explicitly picks "Personnalisé…" — handled
 * client-side). The manual input keeps `data-key` on the *real* setting so
 * it round-trips through the exact same generic update logic as every other
 * control; the dropdown itself is never posted directly (`data-choice-
 * target`, intercepted separately). */
function fontRow(label: string, settingPath: string, current: string, describe: Describe, hasCustomRef: boolean): string {
  const isKnown = FONT_CHOICES.some((f) => f.value === current);
  const selectValue = isKnown ? current : FONT_CUSTOM_SENTINEL;
  const options = FONT_CHOICES.map(
    (f) => `<option value="${escapeHtmlAttr(f.value)}"${f.value === selectValue ? ' selected' : ''}>${escapeHtmlText(f.label)}</option>`,
  ).join('');
  const disabled = hasCustomRef;
  const control =
    `<div class="font-controls">` +
    `<select data-choice-target="${escapeHtmlAttr(settingPath)}"${disabled ? ' disabled' : ''}>` +
    `${options}<option value="${FONT_CUSTOM_SENTINEL}"${selectValue === FONT_CUSTOM_SENTINEL ? ' selected' : ''}>Personnalisé…</option>` +
    `</select>` +
    textInput(settingPath, current, disabled, ' placeholder="Nom de la police" class="manual-font' + (selectValue === FONT_CUSTOM_SENTINEL ? '' : ' hidden') + '"') +
    `</div>`;
  return row({ label, settingPath, control, describe, greyWhenCustomRef: true, hasCustomRef, extraClass: 'font-row' });
}

/** A hex text field + native `<input type=color>` + a row of clickable
 * example swatches, all kept in sync client-side and all writing the same
 * real setting. The color picker/swatches are a convenience on top of the
 * existing plain hex field (kept, for exact/known corporate values), not a
 * replacement for it. */
function colorRow(
  label: string,
  settingPath: string,
  current: string,
  describe: Describe,
  hasCustomRef: boolean,
  placeholder: string,
): string {
  const disabled = hasCustomRef;
  const hex = /^[0-9A-Fa-f]{6}$/.test(current) ? current : '';
  const pickerValue = `#${hex || '000000'}`;
  const swatches = ACCENT_SWATCHES.map(
    (s) =>
      `<button type="button" class="swatch" data-swatch-for="${escapeHtmlAttr(settingPath)}" data-swatch-value="${s}" ` +
      `style="background:#${s}" title="#${s}"${disabled ? ' disabled' : ''}></button>`,
  ).join('');
  const control =
    `<div class="color-controls">` +
    textInput(settingPath, current, disabled, ` placeholder="${escapeHtmlAttr(placeholder)}" maxlength="6" class="hex-input"`) +
    `<input type="color" data-color-for="${escapeHtmlAttr(settingPath)}" value="${pickerValue}"${disabled ? ' disabled' : ''}/>` +
    `<span class="swatches">${swatches}</span>` +
    `</div>`;
  return row({ label, settingPath, control, describe, greyWhenCustomRef: true, hasCustomRef, extraClass: 'color-row' });
}

/** Reverse-match the current heading/body font pair against
 * {@link FONT_PRESETS} so the macro dropdown shows what's actually active
 * instead of always defaulting to its first option — `'custom'` when
 * neither font matches any preset pair exactly. */
function matchFontPreset(headingFont: string, bodyFont: string): string {
  const found = FONT_PRESETS.find((p) => p.heading === headingFont && p.body === bodyFont);
  return found?.id ?? 'custom';
}

/** Same idea as {@link matchFontPreset}, for the page/orientation/margins
 * macro. Custom margins (or any combination not in {@link PAGE_PRESETS})
 * fall back to `'custom'`. */
function matchPagePreset(pageSize: string, orientation: string, margins: string): string {
  const found = PAGE_PRESETS.find((p) => p.pageSize === pageSize && p.orientation === orientation && p.margins === margins);
  return found?.id ?? 'custom';
}

/** Build the full webview HTML for the given state. `nonce` scopes the one
 * inline `<script>` under a strict CSP (`default-src 'none'`) — no external
 * resource is ever loaded, consistent with this project never adding an
 * external OOXML relationship for the same "self-contained output" reason. */
export function buildConfigPanelHtml(state: ConfigState, describe: Describe, nonce: string): string {
  const hasCustomRef = state.referenceDocument.trim() !== '';

  const layoutGroup = [
    row({
      label: 'Format de page',
      settingPath: 'layout.pageSize',
      control: select('layout.pageSize', state.pageSize, PAGE_SIZES, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    row({
      label: 'Orientation',
      settingPath: 'layout.orientation',
      control: select('layout.orientation', state.orientation, ORIENTATIONS, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    row({
      label: 'Marges',
      settingPath: 'layout.margins',
      control: select('layout.margins', state.margins, MARGINS, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    `<div class="row custom-margins${state.margins === 'custom' ? '' : ' hidden'}${hasCustomRef ? ' greyed' : ''}">` +
      `<label>${escapeHtmlText('Marges custom (cm)')}</label>` +
      `<div class="margins-grid">` +
      ['Top', 'Right', 'Bottom', 'Left']
        .map((side) => {
          const key = `layout.marginsCustom${side}`;
          const value = state[`marginsCustom${side}` as keyof ConfigState] as number;
          return `<label class="small">${side}</label>${numberInput(key, value, 0.1, 15, 0.1, hasCustomRef)}`;
        })
        .join('') +
      `</div></div>`,
    row({
      label: 'Pied de page avec numéro de page',
      settingPath: 'layout.footerPageNumber',
      control: checkbox('layout.footerPageNumber', state.footerPageNumber, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    row({
      label: 'Tableaux en section paysage dédiée',
      settingPath: 'layout.landscapeTables',
      control: checkbox('layout.landscapeTables', state.landscapeTables, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
  ].join('\n');

  const typographyGroup = [
    fontRow('Police des titres', 'typography.headingFont', state.headingFont, describe, hasCustomRef),
    fontRow('Police du corps de texte', 'typography.bodyFont', state.bodyFont, describe, hasCustomRef),
    row({
      label: 'Taille de police (pt)',
      settingPath: 'typography.fontSize',
      control: numberInput('typography.fontSize', state.fontSize, 9, 14, 1, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    row({
      label: 'Interligne',
      settingPath: 'typography.lineSpacing',
      control: select('typography.lineSpacing', state.lineSpacing, LINE_SPACINGS, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    row({
      label: 'Justification',
      settingPath: 'typography.justify',
      control: select('typography.justify', state.justify, JUSTIFY, hasCustomRef),
      describe,
      greyWhenCustomRef: true,
      hasCustomRef,
    }),
    colorRow("Couleur d'accent (titres + liens)", 'typography.accentColor', state.accentColor, describe, hasCustomRef, 'ex. 2E7D32'),
    colorRow("Couleur d'en-tête de tableau", 'typography.tableHeaderColor', state.tableHeaderColor, describe, hasCustomRef, 'ex. 4472C4'),
  ].join('\n');

  const structureGroup = [
    row({
      label: 'Sommaire automatique (TOC)',
      settingPath: 'toc.enabled',
      control: checkbox('toc.enabled', state.tocEnabled, false),
      describe,
      greyWhenCustomRef: false,
      hasCustomRef,
    }),
    row({
      label: 'Profondeur du sommaire',
      settingPath: 'toc.depth',
      control: numberInput('toc.depth', state.tocDepth, 2, 4, 1, false),
      describe,
      greyWhenCustomRef: false,
      hasCustomRef,
    }),
  ].join('\n');

  const emojiGroup = row({
    label: 'Rendu couleur des emoji/badges',
    settingPath: 'emoji.forceColorFont',
    control: checkbox('emoji.forceColorFont', state.emojiForceColorFont, false),
    describe,
    greyWhenCustomRef: false,
    hasCustomRef,
  });

  const advancedGroup =
    `<p class="advanced-note">${escapeHtmlText(
      hasCustomRef
        ? 'Un gabarit personnalisé est actif (md2nativedocx.referenceDocument) — les réglages de mise en page et typographie ci-dessus sont ignorés et grisés ; le sommaire et le rendu emoji restent actifs.'
        : "Renseignez un gabarit Word personnalisé pour l'utiliser à la place des réglages ci-dessus.",
    )}</p>` +
    `<div class="row"><label>Gabarit personnalisé (.docx)</label>` +
    `<div class="reference-doc-controls">` +
    textInput('referenceDocument', state.referenceDocument, false, ' placeholder="(aucun)"') +
    `<button type="button" id="browse-reference-doc">Parcourir…</button>` +
    `</div></div>` +
    row({
      label: 'Vérification de conformité Word',
      settingPath: 'wordCompatibilityCheck.enabled',
      control: checkbox('wordCompatibilityCheck.enabled', state.wordCompatibilityCheckEnabled, false),
      describe,
      greyWhenCustomRef: false,
      hasCustomRef,
    });

  const scopeSelector =
    `<div class="scope-toggle">` +
    `<label><input type="radio" name="scope" value="user" ${state.scope === 'user' ? 'checked' : ''}/> Utilisateur</label>` +
    `<label><input type="radio" name="scope" value="workspace" ${state.scope === 'workspace' ? 'checked' : ''}/> Espace de travail</label>` +
    `</div>`;

  const activeFontPreset = matchFontPreset(state.headingFont, state.bodyFont);
  const fontPresetOptions = [
    ...FONT_PRESETS.map((p) => `<option value="${p.id}"${p.id === activeFontPreset ? ' selected' : ''}>${escapeHtmlText(p.label)}</option>`),
    `<option value="custom"${activeFontPreset === 'custom' ? ' selected' : ''}>Personnalisé (réglages détaillés ci-dessous)</option>`,
  ].join('');

  const activePagePreset = matchPagePreset(state.pageSize, state.orientation, state.margins);
  const pagePresetOptions = [
    ...PAGE_PRESETS.map((p) => `<option value="${p.id}"${p.id === activePagePreset ? ' selected' : ''}>${escapeHtmlText(p.label)}</option>`),
    `<option value="custom"${activePagePreset === 'custom' ? ' selected' : ''}>Personnalisé (réglages détaillés ci-dessous)</option>`,
  ].join('');

  const accentSwatchesQuick = ACCENT_SWATCHES.map(
    (s) =>
      `<button type="button" class="swatch" data-swatch-for="typography.accentColor" data-swatch-value="${s}" ` +
      `style="background:#${s}" title="#${s}"${hasCustomRef ? ' disabled' : ''}></button>`,
  ).join('');

  const quickSettings =
    `<div class="quick-row"><label>Modèle de police</label>` +
    `<select id="font-preset"${hasCustomRef ? ' disabled' : ''}>${fontPresetOptions}</select></div>` +
    `<div class="quick-row"><label>Mise en page</label>` +
    `<select id="page-preset"${hasCustomRef ? ' disabled' : ''}>${pagePresetOptions}</select></div>` +
    `<div class="quick-row"><label>Couleur d'accent</label><span class="swatches">${accentSwatchesQuick}</span></div>`;

  const preview = buildPreview();

  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: 13px; padding: 8px; }
  h2 { font-size: 12px; text-transform: uppercase; opacity: 0.75; margin: 16px 0 6px; }
  h2:first-child { margin-top: 0; }
  .top-bar { display: flex; align-items: baseline; justify-content: space-between; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; }
  .row.greyed { opacity: 0.45; pointer-events: none; }
  .row label { flex: 1; }
  .row select, .row input[type=text], .row input[type=number] {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 2px 4px; width: 140px;
  }
  .font-controls { display: flex; gap: 4px; }
  .font-controls .manual-font { width: 120px; }
  .color-controls { display: flex; align-items: center; gap: 4px; }
  .color-controls .hex-input { width: 70px; }
  .color-controls input[type=color] { width: 28px; height: 22px; padding: 0; border: none; background: none; }
  .swatches { display: inline-flex; gap: 3px; }
  .swatch {
    width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--vscode-panel-border); padding: 0; cursor: pointer;
  }
  .margins-grid { display: grid; grid-template-columns: auto 60px auto 60px; gap: 4px 8px; align-items: center; }
  .margins-grid label.small { font-size: 11px; opacity: 0.8; }
  .margins-grid input { width: 60px; }
  .hidden { display: none; }
  .scope-toggle { display: flex; gap: 12px; margin-bottom: 12px; }
  .advanced-note { opacity: 0.85; font-size: 12px; }
  .reference-doc-controls { display: flex; gap: 4px; }
  .reference-doc-controls input[type=text] { width: 140px; }
  #preview-page {
    background: white; color: #1a1a1a; border: 1px solid var(--vscode-panel-border); box-sizing: border-box;
    margin: 8px auto; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  #preview-page h3 { margin: 0 0 6px; }
  #preview-page p { margin: 0; }
  .quick-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; }
  .quick-row select { width: 220px; }
  .reset-btn { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 11px; padding: 0; }
  .reset-btn:hover { text-decoration: underline; }
  #reset-all { font-size: 11px; }
  details.group { border-top: 1px solid var(--vscode-panel-border); padding: 4px 0; }
  details.group summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; list-style: none; }
  details.group summary::-webkit-details-marker { display: none; }
  details.group summary span { font-size: 12px; text-transform: uppercase; opacity: 0.75; }
  details.group summary::before { content: '▸'; margin-right: 6px; opacity: 0.6; }
  details.group[open] summary::before { content: '▾'; }
  .group-body { padding: 6px 2px 2px; }
</style>
</head>
<body>
  <h2>Aperçu</h2>
  ${preview}

  ${scopeSelector}

  <div class="top-bar"><h2>Réglages rapides</h2><button type="button" id="reset-all">Tout réinitialiser</button></div>
  ${quickSettings}

  ${section('Mise en page', GROUP_KEYS.layout, layoutGroup)}
  ${section('Typographie', GROUP_KEYS.typography, typographyGroup)}
  ${section('Structure du document', GROUP_KEYS.structure, structureGroup)}
  ${section('Emoji & badges', GROUP_KEYS.emoji, emojiGroup)}
  ${section('Avancé', GROUP_KEYS.advanced, advancedGroup)}

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const FONT_PRESETS = ${JSON.stringify(FONT_PRESETS)};
  const PAGE_PRESETS = ${JSON.stringify(PAGE_PRESETS)};
  const CUSTOM = '${FONT_CUSTOM_SENTINEL}';

  function currentScope() {
    const checked = document.querySelector('input[name="scope"]:checked');
    return checked ? checked.value : 'user';
  }

  function val(key) {
    const el = document.querySelector('[data-key="' + key + '"]');
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return Number(el.value);
    return el.value;
  }

  function setControlValue(key, value) {
    const el = document.querySelector('[data-key="' + key + '"]');
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }

  document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('change', () => {
      const key = el.getAttribute('data-key');
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'number') value = Number(el.value);
      else value = el.value;
      vscode.postMessage({ type: 'update', key, value, scope: currentScope() });
      if (key === 'layout.margins') {
        document.querySelector('.custom-margins').classList.toggle('hidden', value !== 'custom');
      }
      const colorEl = document.querySelector('[data-color-for="' + key + '"]');
      if (colorEl && /^[0-9A-Fa-f]{6}$/.test(value)) colorEl.value = '#' + value;
      updatePreview();
    });
  });

  // Font dropdown: curated choice vs. "Personnalisé…" (reveals the real
  // text input, itself already wired above via [data-key]).
  document.querySelectorAll('[data-choice-target]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const key = sel.getAttribute('data-choice-target');
      const manual = document.querySelector('.manual-font[data-key="' + key + '"]');
      if (sel.value === CUSTOM) {
        if (manual) { manual.classList.remove('hidden'); manual.focus(); }
        return;
      }
      if (manual) { manual.classList.add('hidden'); manual.value = sel.value; }
      vscode.postMessage({ type: 'update', key, value: sel.value, scope: currentScope() });
      updatePreview();
    });
  });

  // Color swatches: click sets the hex field + native color picker + posts.
  document.querySelectorAll('[data-swatch-for]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-swatch-for');
      const hex = btn.getAttribute('data-swatch-value');
      setControlValue(key, hex);
      const colorEl = document.querySelector('[data-color-for="' + key + '"]');
      if (colorEl) colorEl.value = '#' + hex;
      vscode.postMessage({ type: 'update', key, value: hex, scope: currentScope() });
      updatePreview();
    });
  });

  // Native color picker: live-sync into the hex field while dragging.
  document.querySelectorAll('[data-color-for]').forEach((picker) => {
    picker.addEventListener('input', () => {
      const key = picker.getAttribute('data-color-for');
      const hex = picker.value.replace('#', '').toUpperCase();
      setControlValue(key, hex);
      vscode.postMessage({ type: 'update', key, value: hex, scope: currentScope() });
      updatePreview();
    });
  });

  // Macro: font "package" sets headingFont+bodyFont together.
  const fontPresetEl = document.getElementById('font-preset');
  if (fontPresetEl) {
    fontPresetEl.addEventListener('change', () => {
      const preset = FONT_PRESETS.find((p) => p.id === fontPresetEl.value);
      if (!preset) return;
      vscode.postMessage({
        type: 'updateMany',
        updates: [
          { key: 'typography.headingFont', value: preset.heading },
          { key: 'typography.bodyFont', value: preset.body },
        ],
        scope: currentScope(),
      });
      for (const key of ['typography.headingFont', 'typography.bodyFont']) {
        const value = key === 'typography.headingFont' ? preset.heading : preset.body;
        const choiceSel = document.querySelector('[data-choice-target="' + key + '"]');
        const manual = document.querySelector('.manual-font[data-key="' + key + '"]');
        const known = choiceSel && [...choiceSel.options].some((o) => o.value === value && o.value !== CUSTOM);
        if (choiceSel) choiceSel.value = known ? value : CUSTOM;
        if (manual) { manual.value = value; manual.classList.toggle('hidden', Boolean(known)); }
      }
      updatePreview();
    });
  }

  // Macro: page "preset" sets pageSize+orientation+margins together.
  const pagePresetEl = document.getElementById('page-preset');
  if (pagePresetEl) {
    pagePresetEl.addEventListener('change', () => {
      const preset = PAGE_PRESETS.find((p) => p.id === pagePresetEl.value);
      if (!preset) return;
      vscode.postMessage({
        type: 'updateMany',
        updates: [
          { key: 'layout.pageSize', value: preset.pageSize },
          { key: 'layout.orientation', value: preset.orientation },
          { key: 'layout.margins', value: preset.margins },
        ],
        scope: currentScope(),
      });
      setControlValue('layout.pageSize', preset.pageSize);
      setControlValue('layout.orientation', preset.orientation);
      setControlValue('layout.margins', preset.margins);
      document.querySelector('.custom-margins').classList.toggle('hidden', preset.margins !== 'custom');
      updatePreview();
    });
  }

  // Reset buttons: per-section and the global "Tout réinitialiser" — both
  // just post the keys to clear; the panel re-renders from fresh config
  // once the extension host's onDidChangeConfiguration fires (no need to
  // hand-reset every control's DOM value here too).
  document.querySelectorAll('.reset-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const keys = btn.getAttribute('data-reset-keys').split(',');
      vscode.postMessage({ type: 'reset', keys, scope: currentScope() });
    });
  });
  const resetAllEl = document.getElementById('reset-all');
  if (resetAllEl) {
    resetAllEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'reset', keys: ${JSON.stringify(ALL_SETTING_KEYS)}, scope: currentScope() });
    });
  }

  const browseBtn = document.getElementById('browse-reference-doc');
  if (browseBtn) {
    browseBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'browseReferenceDocument', scope: currentScope() });
    });
  }

  document.querySelectorAll('input[name="scope"]').forEach((el) => {
    el.addEventListener('change', () => vscode.postMessage({ type: 'scope', scope: currentScope() }));
  });

  function updatePreview() {
    const page = document.getElementById('preview-page');
    if (!page) return;
    const landscape = val('layout.orientation') === 'landscape';
    const sizes = { A3: [297, 420], A4: [210, 297], Letter: [216, 279], Legal: [216, 356] };
    let [w, h] = sizes[val('layout.pageSize')] || sizes.A4;
    if (landscape) { const t = w; w = h; h = t; }
    const scale = 0.9;
    page.style.width = (w * scale) + 'px';
    page.style.height = (h * scale) + 'px';
    const marginsCm = { normal: 2.54, narrow: 1.27, moderate: 1.91, wide: 5.08 };
    const preset = val('layout.margins');
    const m = preset === 'custom' ? Number(val('layout.marginsCustomTop')) || 2.54 : (marginsCm[preset] ?? 2.54);
    page.style.padding = (m * scale * 10) + 'px';
    const heading = page.querySelector('h3');
    const body = page.querySelector('p');
    const headingFont = val('typography.headingFont') || 'inherit';
    const bodyFont = val('typography.bodyFont') || 'inherit';
    const accent = val('typography.accentColor');
    heading.style.fontFamily = headingFont;
    heading.style.color = accent ? ('#' + accent) : '';
    body.style.fontFamily = bodyFont;
    body.style.fontSize = (Number(val('typography.fontSize')) || 11) + 'pt';
    const spacings = { default: 1.08, single: 1, '1.15': 1.15, '1.5': 1.5, double: 2 };
    body.style.lineHeight = String(spacings[val('typography.lineSpacing')] ?? 1.08);
    const justify = val('typography.justify');
    body.style.textAlign = justify === 'both' ? 'justify' : (justify === 'right' || justify === 'center') ? justify : 'left';
  }

  updatePreview();
})();
</script>
</body>
</html>`;
}

function buildPreview(): string {
  return (
    `<div id="preview-page"><h3>Titre du document</h3>` +
    `<p>Ceci est un aperçu simplifié de la mise en page et de la typographie choisies. Le rendu final ` +
    `dans Word peut différer legerement.</p></div>`
  );
}
