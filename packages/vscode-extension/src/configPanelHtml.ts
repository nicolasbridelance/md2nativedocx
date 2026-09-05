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
 * Security: `headingFont`/`bodyFont`/`accentColor`/`referenceDocument` are
 * free-text settings a user can type anything into — every one of them
 * reaches this HTML as an attribute or text value and must be escaped
 * ({@link escapeHtmlAttr}/{@link escapeHtmlText}), the same non-negotiable
 * rule this project already applies to user text reaching XML output.
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
  tocEnabled: boolean;
  tocDepth: number;
  emojiForceColorFont: boolean;
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
}

function row({ label, settingPath, control, describe, greyWhenCustomRef, hasCustomRef }: RowOptions): string {
  const greyed = greyWhenCustomRef && hasCustomRef;
  return (
    `<div class="row${greyed ? ' greyed' : ''}" title="${tooltip(describe, settingPath)}">` +
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

function textInput(key: string, value: string, disabled: boolean): string {
  return `<input type="text" data-key="${escapeHtmlAttr(key)}" value="${escapeHtmlAttr(value)}"${disabled ? ' disabled' : ''}/>`;
}

function numberInput(key: string, value: number, min: number, max: number, step: number, disabled: boolean): string {
  return (
    `<input type="number" data-key="${escapeHtmlAttr(key)}" value="${value}" min="${min}" max="${max}" step="${step}"` +
    `${disabled ? ' disabled' : ''}/>`
  );
}

const PAGE_SIZES = ['A4', 'Letter', 'Legal'] as const;
const ORIENTATIONS = ['portrait', 'landscape'] as const;
const MARGINS = ['normal', 'narrow', 'moderate', 'wide', 'custom'] as const;
const LINE_SPACINGS = ['default', 'single', '1.15', '1.5', 'double'] as const;
const JUSTIFY = ['left', 'both'] as const;

/** Build the full webview HTML for the given state. `nonce` scopes the one
 * inline `<script>` under a strict CSP (`default-src 'none'`) — no external
 * resource is ever loaded, consistent with this project never adding an
 * external OOXML relationship for the same "self-contained output" reason. */
export function buildConfigPanelHtml(state: ConfigState, describe: Describe, nonce: string): string {
  const hasCustomRef = state.referenceDocument.trim() !== '';
  const g = true; // greyWhenCustomRef shorthand for Lot 1 rows
  const ng = false; // never greyed (TOC/emoji)

  const layoutGroup = [
    row({
      label: 'Format de page',
      settingPath: 'layout.pageSize',
      control: select('layout.pageSize', state.pageSize, PAGE_SIZES, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Orientation',
      settingPath: 'layout.orientation',
      control: select('layout.orientation', state.orientation, ORIENTATIONS, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Marges',
      settingPath: 'layout.margins',
      control: select('layout.margins', state.margins, MARGINS, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
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
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Tableaux en section paysage dédiée',
      settingPath: 'layout.landscapeTables',
      control: checkbox('layout.landscapeTables', state.landscapeTables, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
  ].join('\n');

  const typographyGroup = [
    row({
      label: 'Police des titres',
      settingPath: 'typography.headingFont',
      control: textInput('typography.headingFont', state.headingFont, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Police du corps de texte',
      settingPath: 'typography.bodyFont',
      control: textInput('typography.bodyFont', state.bodyFont, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Taille de police (pt)',
      settingPath: 'typography.fontSize',
      control: numberInput('typography.fontSize', state.fontSize, 9, 14, 1, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Interligne',
      settingPath: 'typography.lineSpacing',
      control: select('typography.lineSpacing', state.lineSpacing, LINE_SPACINGS, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: 'Justification',
      settingPath: 'typography.justify',
      control: select('typography.justify', state.justify, JUSTIFY, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
    row({
      label: "Couleur d'accent (hex, sans #)",
      settingPath: 'typography.accentColor',
      control: textInput('typography.accentColor', state.accentColor, hasCustomRef),
      describe,
      greyWhenCustomRef: g,
      hasCustomRef,
    }),
  ].join('\n');

  const structureGroup = [
    row({
      label: 'Sommaire automatique (TOC)',
      settingPath: 'toc.enabled',
      control: checkbox('toc.enabled', state.tocEnabled, false),
      describe,
      greyWhenCustomRef: ng,
      hasCustomRef,
    }),
    row({
      label: 'Profondeur du sommaire',
      settingPath: 'toc.depth',
      control: numberInput('toc.depth', state.tocDepth, 2, 4, 1, false),
      describe,
      greyWhenCustomRef: ng,
      hasCustomRef,
    }),
  ].join('\n');

  const emojiGroup = row({
    label: 'Rendu couleur des emoji/badges',
    settingPath: 'emoji.forceColorFont',
    control: checkbox('emoji.forceColorFont', state.emojiForceColorFont, false),
    describe,
    greyWhenCustomRef: ng,
    hasCustomRef,
  });

  const advancedGroup =
    `<p class="advanced-note">${escapeHtmlText(
      hasCustomRef
        ? 'Un gabarit personnalisé est actif (md2nativedocx.referenceDocument) — les réglages de mise en page et typographie ci-dessus sont ignorés et grisés ; le sommaire et le rendu emoji restent actifs.'
        : "Renseignez md2nativedocx.referenceDocument (paramètres VS Code) pour utiliser votre propre gabarit Word au lieu des réglages ci-dessus.",
    )}</p>` + `<p class="advanced-value">${escapeHtmlText(state.referenceDocument || '(aucun)')}</p>`;

  const scopeSelector =
    `<div class="scope-toggle">` +
    `<label><input type="radio" name="scope" value="user" ${state.scope === 'user' ? 'checked' : ''}/> Utilisateur</label>` +
    `<label><input type="radio" name="scope" value="workspace" ${state.scope === 'workspace' ? 'checked' : ''}/> Espace de travail</label>` +
    `</div>`;

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
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; }
  .row.greyed { opacity: 0.45; pointer-events: none; }
  .row label { flex: 1; }
  .row select, .row input[type=text], .row input[type=number] {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 2px 4px; width: 140px;
  }
  .margins-grid { display: grid; grid-template-columns: auto 60px auto 60px; gap: 4px 8px; align-items: center; }
  .margins-grid label.small { font-size: 11px; opacity: 0.8; }
  .margins-grid input { width: 60px; }
  .hidden { display: none; }
  .scope-toggle { display: flex; gap: 12px; margin-bottom: 12px; }
  .advanced-note { opacity: 0.85; font-size: 12px; }
  .advanced-value { font-family: var(--vscode-editor-font-family); font-size: 12px; opacity: 0.7; word-break: break-all; }
  #preview-page {
    background: white; color: #1a1a1a; border: 1px solid var(--vscode-panel-border); box-sizing: border-box;
    margin: 8px auto; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  #preview-page h3 { margin: 0 0 6px; }
  #preview-page p { margin: 0; }
</style>
</head>
<body>
  <h2>Aperçu</h2>
  ${preview}

  ${scopeSelector}

  <h2>Mise en page</h2>
  ${layoutGroup}

  <h2>Typographie</h2>
  ${typographyGroup}

  <h2>Structure du document</h2>
  ${structureGroup}

  <h2>Emoji &amp; badges</h2>
  ${emojiGroup}

  <h2>Avancé</h2>
  ${advancedGroup}

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();

  function currentScope() {
    const checked = document.querySelector('input[name="scope"]:checked');
    return checked ? checked.value : 'user';
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
      updatePreview();
    });
  });

  document.querySelectorAll('input[name="scope"]').forEach((el) => {
    el.addEventListener('change', () => vscode.postMessage({ type: 'scope', scope: currentScope() }));
  });

  function val(key) {
    const el = document.querySelector('[data-key="' + key + '"]');
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return Number(el.value);
    return el.value;
  }

  function updatePreview() {
    const page = document.getElementById('preview-page');
    if (!page) return;
    const landscape = val('layout.orientation') === 'landscape';
    const sizes = { A4: [210, 297], Letter: [216, 279], Legal: [216, 356] };
    let [w, h] = sizes[val('layout.pageSize')] || sizes.A4;
    if (landscape) { const t = w; w = h; h = t; }
    const scale = 1.2;
    page.style.width = (w * scale) + 'px';
    page.style.height = (h * scale) + 'px';
    const marginsCm = { normal: 2.5, narrow: 1.27, moderate: 1.9, wide: 5.08 };
    const preset = val('layout.margins');
    const m = preset === 'custom' ? Number(val('layout.marginsCustomTop')) || 2.5 : (marginsCm[preset] ?? 2.5);
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
    body.style.textAlign = val('typography.justify') === 'both' ? 'justify' : 'left';
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
