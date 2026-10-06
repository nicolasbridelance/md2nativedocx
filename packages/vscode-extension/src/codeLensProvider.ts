import * as vscode from 'vscode';
import { parseMermaidBlocks, isMermaidFilePath } from './mermaidBlocks';

/** CodeLenses (docs/specs/UX_REVIEW_2026-10.md §3.2): one line at the top of the file for the whole
 * document — Export to Word · Export to PowerPoint (when there is a diagram) · Settings — and, above each
 * ```mermaid block, "Export this diagram…" for that diagram alone. The document actions are no longer
 * repeated above every block (they used to be, which made a lens placed on a block act on the whole
 * document). Deliberately redundant with the status bar item — see docs/specs/UX_SPEC.md for why. */
export class MermaidCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const isMmd = isMermaidFilePath(document.uri.fsPath);
    const blocks = isMmd ? [] : parseMermaidBlocks(document.getText());
    const top = new vscode.Range(0, 0, 0, 0);

    // One line for the whole document, at the top. PowerPoint only when there is a diagram to put on a slide.
    const lenses: vscode.CodeLens[] = [
      new vscode.CodeLens(top, {
        title: `$(file) ${vscode.l10n.t('Export to Word')}`,
        command: 'md2nativedocx.exportDocument',
        arguments: [document.uri],
        tooltip: vscode.l10n.t(
          'Converts the whole document (text, tables, formatting, all diagrams) to .docx — each diagram becomes native, editable Word shapes, not an image.',
        ),
      }),
    ];
    if (isMmd || blocks.length > 0) {
      lenses.push(
        new vscode.CodeLens(top, {
          title: `$(preview) ${vscode.l10n.t('Export to PowerPoint')}`,
          command: 'md2nativedocx.exportDocumentPptx',
          arguments: [document.uri],
          tooltip: vscode.l10n.t('One slide per diagram, titled with the heading above it, with editable shapes. Text outside diagrams is not exported.'),
        }),
      );
    }
    lenses.push(
      new vscode.CodeLens(top, {
        title: `$(gear) ${vscode.l10n.t('Settings')}`,
        command: 'md2nativedocx.openSettings',
        tooltip: vscode.l10n.t('Page layout, fonts, diagrams (SmartArt, charts), output folder'),
      }),
    );

    // Above each diagram: the action on that diagram alone.
    for (const block of blocks) {
      lenses.push(
        new vscode.CodeLens(new vscode.Range(block.fenceLine, 0, block.fenceLine, 0), {
          title: vscode.l10n.t('Export this diagram…'),
          command: 'md2nativedocx.exportBlock',
          arguments: [document.uri, block.index],
          tooltip: vscode.l10n.t('Only this diagram, into its own Word document or a one-slide PowerPoint deck.'),
        }),
      );
    }
    return lenses;
  }
}
