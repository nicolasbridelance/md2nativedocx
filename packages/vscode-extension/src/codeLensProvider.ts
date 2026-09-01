import * as vscode from 'vscode';
import { parseMermaidBlocks } from './mermaidBlocks';

/** Two CodeLenses above every ```mermaid block (UX_SPEC.md Partie 1 —
 * "Points d'entrée"): exporting the whole document is the primary action,
 * exporting just this block the secondary one. Deliberately redundant with
 * the status bar item — see UX_SPEC.md for why. */
export class MermaidCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const blocks = parseMermaidBlocks(document.getText());
    const lenses: vscode.CodeLens[] = [];
    for (const block of blocks) {
      const range = new vscode.Range(block.fenceLine, 0, block.fenceLine, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: `⚙️ ${vscode.l10n.t('Export to Word')}`,
          command: 'md2nativedocx.exportDocument',
          arguments: [document.uri],
          tooltip: vscode.l10n.t(
            'Converts the whole document (text, tables, formatting, all diagrams) to .docx — each diagram becomes native, editable Word shapes, not an image.',
          ),
        }),
        new vscode.CodeLens(range, {
          title: vscode.l10n.t('Export this block only'),
          command: 'md2nativedocx.exportBlock',
          arguments: [document.uri, block.index],
          tooltip: vscode.l10n.t(
            'Converts only this diagram into its own .docx — handy for pasting it elsewhere without the rest of the document.',
          ),
        }),
      );
    }
    return lenses;
  }
}
