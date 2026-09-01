import * as vscode from 'vscode';
import { parseMermaidBlocks } from './mermaidBlocks';

/** Persistent second entry point (UX_SPEC.md Partie 1 — "Points d'entrée"),
 * deliberately redundant with the CodeLens: visible without scrolling to a
 * specific block, for users who filter out CodeLens visually (GitLens,
 * Copilot, etc. already crowd that space). Shown only when the active editor
 * is a Markdown document with at least one mermaid block. */
export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'md2nativedocx.exportDocument';
  context.subscriptions.push(item);

  const update = (editor: vscode.TextEditor | undefined) => {
    if (!editor || editor.document.languageId !== 'markdown') {
      item.hide();
      return;
    }
    const blockCount = parseMermaidBlocks(editor.document.getText()).length;
    if (blockCount === 0) {
      item.hide();
      return;
    }
    item.text = `$(file-symlink-file) ${vscode.l10n.t('Export to Word')}`;
    item.tooltip =
      blockCount === 1
        ? vscode.l10n.t('1 mermaid diagram detected — export the document as a native .docx')
        : vscode.l10n.t('{0} mermaid diagrams detected — export the document as a native .docx', blockCount);
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
