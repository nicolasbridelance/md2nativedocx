import * as vscode from 'vscode';
import { parseMermaidBlocks, isExportablePath, isMermaidFilePath } from './mermaidBlocks';

/** Persistent second entry point (docs/specs/UX_SPEC.md Partie 1 — "Points d'entrée"),
 * deliberately redundant with the CodeLens: visible without scrolling to a
 * specific block, for users who filter out CodeLens visually (GitLens,
 * Copilot, etc. already crowd that space). Shown for any Markdown (`.md`) or
 * raw Mermaid (`.mmd`) document — the underlying pipeline exports full
 * Markdown (text, tables, formatting) regardless of whether it contains a
 * diagram, so the entry point isn't gated on one being present. */
export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'md2nativedocx.exportDocument';
  context.subscriptions.push(item);

  const update = (editor: vscode.TextEditor | undefined) => {
    const path = editor?.document.uri.fsPath;
    if (!path || !isExportablePath(path)) {
      item.hide();
      return;
    }
    item.text = `$(file-symlink-file) ${vscode.l10n.t('Export to Word')}`;
    if (isMermaidFilePath(path)) {
      item.tooltip = vscode.l10n.t('Export this diagram as a native .docx');
    } else {
      const blockCount = parseMermaidBlocks(editor.document.getText()).length;
      item.tooltip =
        blockCount === 0
          ? vscode.l10n.t('Export this document as a native .docx')
          : blockCount === 1
            ? vscode.l10n.t('1 mermaid diagram detected — export the document as a native .docx')
            : vscode.l10n.t('{0} mermaid diagrams detected — export the document as a native .docx', blockCount);
    }
    item.show();
  };

  update(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        update(vscode.window.activeTextEditor);
      }
    }),
  );
}
