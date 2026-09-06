import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildConfigPanelHtml, type ConfigState, type Describe } from './configPanelHtml';

/** Must match `contributes.views`' view id in `package.json`. */
export const CONFIG_VIEW_ID = 'md2nativedocx.configView';

/**
 * The Lot 4 configuration panel (`docs/specs/export_customization_SPEC.md`
 * §3) — a `WebviewView` in a dedicated Activity Bar container. All HTML
 * generation lives in the pure, vscode-free `configPanelHtml.ts`; this class
 * is only the glue: read current settings -> build state -> render, and
 * route the webview's `postMessage` calls back into
 * `vscode.workspace.getConfiguration(...).update(...)`.
 */
export class ConfigPanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private nlsStrings: Record<string, string> | undefined;
  /** Which `ConfigurationTarget` panel edits write to — chosen via the
   * scope toggle rendered at the top of the panel (spec §3.4). Session-only
   * (not itself persisted): defaults back to "user" on next activation,
   * the safer of the two. */
  private scope: 'user' | 'workspace' = 'user';
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.render();

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      // Keeps the panel in sync when the same settings change from
      // settings.json/the native Settings UI — spec §3.4, "toujours
      // synchronisés, aucune double source de vérité".
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('md2nativedocx')) this.render();
      }),
    );
    webviewView.onDidDispose(() => {
      this.disposables.forEach((d) => d.dispose());
      this.disposables.length = 0;
    });
  }

  private readonly describe: Describe = (settingPath) => {
    this.nlsStrings ??= this.loadNlsStrings();
    return this.nlsStrings[`configuration.${settingPath}.markdownDescription`] ?? '';
  };

  /** Reads `package.nls.json` directly (not `package.nls.<locale>.json` —
   * none of the Lot 1-3 keys are translated yet, same gap already flagged
   * in TODO.md/HANDOVER.md) so every tooltip is the exact same string
   * `contributes.configuration` already declares — no text duplicated
   * between the two surfaces (spec §3.2). */
  private loadNlsStrings(): Record<string, string> {
    try {
      const path = join(this.context.extensionUri.fsPath, 'package.nls.json');
      if (!existsSync(path)) return {};
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private readState(): ConfigState {
    const config = vscode.workspace.getConfiguration('md2nativedocx');
    return {
      pageSize: config.get<string>('layout.pageSize', 'A4'),
      orientation: config.get<string>('layout.orientation', 'portrait'),
      margins: config.get<string>('layout.margins', 'normal'),
      marginsCustomTop: config.get<number>('layout.marginsCustomTop', 2.5),
      marginsCustomRight: config.get<number>('layout.marginsCustomRight', 2.5),
      marginsCustomBottom: config.get<number>('layout.marginsCustomBottom', 2.5),
      marginsCustomLeft: config.get<number>('layout.marginsCustomLeft', 2.5),
      footerPageNumber: config.get<boolean>('layout.footerPageNumber', false),
      landscapeTables: config.get<boolean>('layout.landscapeTables', false),
      headingFont: config.get<string>('typography.headingFont', ''),
      bodyFont: config.get<string>('typography.bodyFont', ''),
      fontSize: config.get<number>('typography.fontSize', 11),
      lineSpacing: config.get<string>('typography.lineSpacing', 'default'),
      justify: config.get<string>('typography.justify', 'left'),
      accentColor: config.get<string>('typography.accentColor', ''),
      tableHeaderColor: config.get<string>('typography.tableHeaderColor', ''),
      tocEnabled: config.get<boolean>('toc.enabled', false),
      tocDepth: config.get<number>('toc.depth', 3),
      emojiForceColorFont: config.get<boolean>('emoji.forceColorFont', true),
      wordCompatibilityCheckEnabled: config.get<boolean>('wordCompatibilityCheck.enabled', true),
      referenceDocument: config.get<string>('referenceDocument', ''),
      scope: this.scope,
    };
  }

  private render(): void {
    if (!this.view) return;
    const nonce = randomBytes(16).toString('hex');
    this.view.webview.html = buildConfigPanelHtml(this.readState(), this.describe, nonce);
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const msg = message as {
      type?: string;
      key?: string;
      value?: unknown;
      scope?: string;
      updates?: { key: string; value: unknown }[];
      keys?: string[];
    };
    if (msg.type === 'scope') {
      if (msg.scope === 'user' || msg.scope === 'workspace') this.scope = msg.scope;
      return;
    }
    const target = msg.scope === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    const config = vscode.workspace.getConfiguration('md2nativedocx');
    if (msg.type === 'update' && typeof msg.key === 'string') {
      void config.update(msg.key, msg.value, target);
      return;
    }
    // A macro control (font/page preset) writes several real settings at
    // once from a single dropdown pick — one `update` per key, same target.
    if (msg.type === 'updateMany' && Array.isArray(msg.updates)) {
      for (const { key, value } of msg.updates) {
        if (typeof key === 'string') void config.update(key, value, target);
      }
      return;
    }
    // "Reset this section" / "Reset all" — `undefined` removes the override
    // at this target, falling back to the schema default (or a broader
    // scope's value), same as clicking the native gear icon's "Reset
    // Setting" in Settings UI.
    if (msg.type === 'reset' && Array.isArray(msg.keys)) {
      for (const key of msg.keys) {
        if (typeof key === 'string') void config.update(key, undefined, target);
      }
      return;
    }
    if (msg.type === 'browseReferenceDocument') {
      void this.browseReferenceDocument(target);
      return;
    }
  }

  private async browseReferenceDocument(target: vscode.ConfigurationTarget): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Word document': ['docx'] },
      openLabel: 'Utiliser comme gabarit',
    });
    const uri = picked?.[0];
    if (!uri) return;
    const path = vscode.workspace.asRelativePath(uri, false);
    await vscode.workspace.getConfiguration('md2nativedocx').update('referenceDocument', path, target);
  }
}
