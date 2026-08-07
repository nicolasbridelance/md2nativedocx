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
          title: '⚙️ Exporter en Word',
          command: 'md2nativedocx.exportDocument',
          arguments: [document.uri],
        }),
        new vscode.CodeLens(range, {
          title: 'Exporter le bloc seul',
          command: 'md2nativedocx.exportBlock',
          arguments: [document.uri, block.index],
        }),
      );
    }
    return lenses;
  }
}
