import * as vscode from 'vscode';
import { join } from 'node:path';

/**
 * "What will this diagram become?" for the CodeLens, the hover and the status bar
 * (docs/specs/UX_REVIEW_2026-10.md §3.2-3.5, lot B). The answer comes from the core engine's
 * `planRendering` (packages/core/src/rendering-plan.ts), bundled into `dist/analysis.cjs` by
 * `scripts/bundle-analysis.mjs` — the same rules the exporter applies, without exporting anything.
 * This module only turns that answer into localized text.
 */

/** Mirror of the core's `RenderingPlan` (kept local: the extension does not depend on the core package). */
export interface RenderingPlan {
  type: string;
  label: string;
  rendering: 'smartart' | 'chart' | 'shapes' | 'invalid';
  smartArt?: { layout: 'chain' | 'tree' | 'cycle'; depth?: number };
  smartArtRejected?: { reason: string; at: string[] };
  smartArtWouldApply?: boolean;
  chartWouldApply?: boolean;
  error?: string;
}

type PlanRendering = (source: string, settings: { smartArt: boolean; nativeCharts: boolean }) => RenderingPlan;

let planRenderingFn: PlanRendering | null | undefined;

/** The bundled `planRendering`, or `null` if the bundle is missing (then no plan is shown, exports still work). */
function loadPlanner(): PlanRendering | null {
  if (planRenderingFn !== undefined) return planRenderingFn;
  try {
    // Built next to extension.js by scripts/bundle-analysis.mjs; a plain require keeps it synchronous.
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- CommonJS bundle loaded at runtime by path
    planRenderingFn = (require(join(__dirname, 'analysis.cjs')) as { planRendering: PlanRendering }).planRendering;
  } catch {
    // Safe to swallow: the plan is an information aid; without it the CodeLens just shows the export action.
    planRenderingFn = null;
  }
  return planRenderingFn;
}

/** The rendering plan of `source` under the current settings, or `null` if the planner is unavailable. */
export function planFor(source: string): RenderingPlan | null {
  const planner = loadPlanner();
  if (!planner) return null;
  const config = vscode.workspace.getConfiguration('md2nativedocx');
  return planner(source, {
    smartArt: config.get<boolean>('smartArt.enabled', false),
    nativeCharts: config.get<boolean>('nativeCharts.enabled', false),
  });
}

/** Short, user-facing reason a flowchart cannot be SmartArt (spec §10.1 reason codes). */
function rejectionText(rejected: { reason: string; at: string[] }): string {
  const at = rejected.at.join(', ');
  switch (rejected.reason) {
    case 'merge-after-branch':
      return vscode.l10n.t('branches merge again at {0}', at);
    case 'subgraph':
      return vscode.l10n.t('it has a subgraph');
    case 'self-loop':
      return vscode.l10n.t('{0} links to itself', at);
    case 'disconnected':
      return vscode.l10n.t('it has separate, unconnected parts');
    case 'tree-too-deep':
      return vscode.l10n.t('more than 10 levels');
    default:
      return vscode.l10n.t('its shape is not a process, a hierarchy or a cycle');
  }
}

/** One-line summary for the CodeLens above a diagram, with a codicon. */
export function planSummary(plan: RenderingPlan): string {
  switch (plan.rendering) {
    case 'smartart': {
      const layout = plan.smartArt?.layout;
      if (layout === 'chain') return `$(type-hierarchy) ${vscode.l10n.t('SmartArt — process')}`;
      if (layout === 'cycle') return `$(type-hierarchy) ${vscode.l10n.t('SmartArt — cycle')}`;
      return `$(type-hierarchy) ${vscode.l10n.t('SmartArt — hierarchy, {0} levels', plan.smartArt?.depth ?? 2)}`;
    }
    case 'chart':
      return `$(graph) ${vscode.l10n.t('Word chart')}`;
    case 'invalid':
      return `$(warning) ${vscode.l10n.t('This diagram has errors')}`;
    default:
      if (plan.smartArtRejected) return `$(primitive-square) ${vscode.l10n.t('Word shapes (no SmartArt: {0})', rejectionText(plan.smartArtRejected))}`;
      if (plan.smartArtWouldApply) return `$(primitive-square) ${vscode.l10n.t('Word shapes · SmartArt possible')}`;
      if (plan.chartWouldApply) return `$(primitive-square) ${vscode.l10n.t('Word shapes · Word chart possible')}`;
      return `$(primitive-square) ${vscode.l10n.t('Word shapes')}`;
  }
}

/** The setting that would change this diagram's rendering, if any (for "Enable …" actions). */
export function settingToEnable(plan: RenderingPlan): { key: string; label: string } | undefined {
  if (plan.smartArtWouldApply) return { key: 'smartArt.enabled', label: vscode.l10n.t('Enable SmartArt') };
  if (plan.chartWouldApply) return { key: 'nativeCharts.enabled', label: vscode.l10n.t('Enable Word charts') };
  return undefined;
}

/** Hover text for a ```mermaid fence: what the diagram becomes, what can be done with it, what is lost. */
export function planHover(plan: RenderingPlan): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = { enabledCommands: ['md2nativedocx.enableSetting'] };
  md.appendMarkdown(`**${plan.label}** — ${planSummary(plan)}\n\n`);
  switch (plan.rendering) {
    case 'smartart':
      md.appendMarkdown(vscode.l10n.t("In Word: a SmartArt graphic. Add a step or a branch, retype, restyle or recolour it from Word's SmartArt Design tab.") + '\n\n');
      if (plan.type === 'mindmap') md.appendMarkdown(vscode.l10n.t('Not kept as SmartArt: the radial layout and the node shapes (turn SmartArt off to keep them).') + '\n\n');
      if (plan.type === 'treeView') md.appendMarkdown(vscode.l10n.t('Not kept as SmartArt: bold folders and italic descriptions (they become plain text).') + '\n\n');
      break;
    case 'chart':
      md.appendMarkdown(vscode.l10n.t('In Word: a native chart. Chart Design → Edit Data changes the figures.') + '\n\n');
      break;
    case 'invalid':
      md.appendMarkdown(vscode.l10n.t('The export will report: {0}', plan.error ?? '') + '\n\n');
      break;
    default:
      md.appendMarkdown(vscode.l10n.t('In Word: every box, arrow and label is a separate shape you can move, retype and recolour.') + '\n\n');
  }
  const enable = settingToEnable(plan);
  if (enable) {
    const args = encodeURIComponent(JSON.stringify([enable.key]));
    md.appendMarkdown(`[${enable.label}](command:md2nativedocx.enableSetting?${args})\n\n`);
  }
  if (plan.rendering === 'smartart' || plan.rendering === 'chart') {
    md.appendMarkdown(`_${vscode.l10n.t('In PowerPoint, this diagram is made of editable shapes.')}_`);
  }
  return md;
}

/** Status bar tally, e.g. "6 diagrams: 3 SmartArt, 2 Word shapes, 1 Word chart". */
export function planTally(plans: RenderingPlan[]): string {
  const count = (r: RenderingPlan['rendering']) => plans.filter((p) => p.rendering === r).length;
  const parts = [
    [count('smartart'), vscode.l10n.t('SmartArt')],
    [count('shapes'), vscode.l10n.t('Word shapes')],
    [count('chart'), vscode.l10n.t('Word chart')],
    [count('invalid'), vscode.l10n.t('with errors')],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, label]) => `${n} ${label}`);
  return plans.length === 1
    ? vscode.l10n.t('1 diagram: {0}', parts.join(', '))
    : vscode.l10n.t('{0} diagrams: {1}', plans.length, parts.join(', '));
}
