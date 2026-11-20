import * as vscode from 'vscode';

/** Mermaid chart types that become native Word charts, all three confirmed in real Word (CHECKLIST Rounds 4-5). */
const CHART_TYPES = ['pie', 'xychart', 'radar'];

/** `md2nativedocx.nativeCharts.enabled` (default on, UX review D2): which Mermaid chart types become native
 * Word charts. Shared with the CodeLens/hover planner (`diagramPlan.ts`). */
export function nativeChartTypesSetting(): string[] {
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  return config.get<boolean>('nativeCharts.enabled', true) ? [...CHART_TYPES] : [];
}

/** `md2nativedocx.sandbox.enabled`, for Markdown the user did not write. On as soon as any scope turns it on:
 * a repository's `.vscode/settings.json` can switch it on for its files but never off against the user's own
 * settings, since the files it protects against may come with that repository. Shared with the settings panel,
 * which shows this effective value. */
export function sandboxEnabledSetting(): boolean {
  const inspected = vscode.workspace.getConfiguration('md2nativedocx').inspect<boolean>('sandbox.enabled');
  return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue].includes(true);
}
