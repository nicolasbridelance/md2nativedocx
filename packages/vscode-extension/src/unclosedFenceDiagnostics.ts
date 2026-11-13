import * as vscode from 'vscode';
import { findUnclosedMermaidFences, isExportablePath, isMermaidFilePath } from './mermaidBlocks';

const CODE = 'md2nativedocx.unclosedMermaidFence';

/** Editor diagnostics for an unclosed ```mermaid fence (TODO §R1.5), with a Quick Fix that adds the closing
 * fence. Without it Pandoc turns the rest of the file into plain code and says nothing. */
export function registerUnclosedFenceDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('md2nativedocx');

  const refresh = (document: vscode.TextDocument): void => {
    if (document.uri.scheme !== 'file' || !isExportablePath(document.uri.fsPath) || isMermaidFilePath(document.uri.fsPath)) return;
    const diagnostics = findUnclosedMermaidFences(document.getText()).map((fence) => {
      const line = document.lineAt(fence.fenceLine);
      const diagnostic = new vscode.Diagnostic(
        line.range,
        vscode.l10n.t('This ```mermaid block is never closed: everything after it is treated as plain code and no diagram is exported.'),
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.code = CODE;
      diagnostic.source = 'md2nativedocx';
      return diagnostic;
    });
    collection.set(document.uri, diagnostics);
  };

  const quickFix: vscode.CodeActionProvider = {
    provideCodeActions(document, _range, ctx) {
      const actions: vscode.CodeAction[] = [];
      for (const diagnostic of ctx.diagnostics) {
        if (diagnostic.code !== CODE) continue;
        const fence = findUnclosedMermaidFences(document.getText()).find((f) => f.fenceLine === diagnostic.range.start.line);
        if (!fence) continue;
        const action = new vscode.CodeAction(vscode.l10n.t('Add the closing ```'), vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const edit = new vscode.WorkspaceEdit();
        const before = fence.suggestedCloseBeforeLine;
        if (before >= document.lineCount) {
          const last = document.lineAt(document.lineCount - 1);
          edit.insert(document.uri, last.range.end, `${last.text.length > 0 ? '\n' : ''}${fence.marker}\n`);
        } else {
          edit.insert(document.uri, new vscode.Position(before, 0), `${fence.marker}\n\n`);
        }
        action.edit = edit;
        actions.push(action);
      }
      return actions;
    },
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)),
    vscode.languages.registerCodeActionsProvider({ pattern: '**/*.{md,qmd}' }, quickFix, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
  );
  for (const document of vscode.workspace.textDocuments) refresh(document);
}
