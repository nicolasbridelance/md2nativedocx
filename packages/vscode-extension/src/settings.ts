import * as vscode from 'vscode';

/** Mermaid chart types that become native Word charts, all three confirmed in real Word (CHECKLIST Rounds 4-5). */
const CHART_TYPES = ['pie', 'xychart', 'radar'];

/** `md2nativedocx.nativeCharts.enabled` (default on, UX review D2): which Mermaid chart types become native
 * Word charts. Shared with the CodeLens/hover planner (`diagramPlan.ts`). */
export function nativeChartTypesSetting(): string[] {
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  return config.get<boolean>('nativeCharts.enabled', true) ? [...CHART_TYPES] : [];
}
