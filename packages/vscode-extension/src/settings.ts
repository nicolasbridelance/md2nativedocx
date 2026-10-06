import * as vscode from 'vscode';

/** Chart types confirmed in real Word (CHECKLIST Round 4); `xychart`/`radar` join once Round 5 is confirmed. */
const VERIFIED_CHART_TYPES = ['pie'];
const UNVERIFIED_CHART_TYPES = ['xychart', 'radar'];

/** `md2nativedocx.nativeCharts.enabled` (default on, D2) + `.includeUnverified` (default off): which Mermaid
 * chart types become native Word charts. Shared with the CodeLens/hover planner (`diagramPlan.ts`). */
export function nativeChartTypesSetting(): string[] {
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  if (!config.get<boolean>('nativeCharts.enabled', true)) return [];
  return config.get<boolean>('nativeCharts.includeUnverified', false) ? [...VERIFIED_CHART_TYPES, ...UNVERIFIED_CHART_TYPES] : [...VERIFIED_CHART_TYPES];
}
