import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import type { PluginFrontendContribution } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { lazy } from "react";
import { z } from "zod";
import {
  getLastMarketplacePath,
  isWorkflowMarketplacePath,
  MARKETPLACE_PATH,
  NEW_WORKFLOW_PATH,
  RUNS_PATH,
  runPath,
  WORKFLOWS_ROOT,
  workflowPath,
} from "./lib/paths.ts";
import manifest, {
  WORKFLOW_CREATE_VIEW,
  WORKFLOW_EDITOR_VIEW,
  WORKFLOW_MARKETPLACE_VIEW,
  WORKFLOW_RUN_DETAIL_VIEW,
  WORKFLOWS_OVERVIEW_VIEW,
  WORKFLOWS_SIDEBAR_VIEWS,
  workflowCreateViewManifest,
  workflowEditorViewManifest,
  workflowLibraryViewManifest,
  workflowMarketplaceViewManifest,
  workflowRunDetailViewManifest,
  workflowRunsViewManifest,
  workflowsOverviewViewManifest,
} from "./manifest.ts";

export const WorkflowEditorParams = z.object({ name: z.string().min(1) });
export type WorkflowEditorParams = z.infer<typeof WorkflowEditorParams>;

export const WorkflowRunDetailParams = z.object({ runId: z.string().min(1) });
export type WorkflowRunDetailParams = z.infer<typeof WorkflowRunDetailParams>;

/**
 * The Workflows dashboard: library on the left; overview, editors, run
 * details and the marketplace as tabs on the right. Routes: `/workflows`,
 * `/workflows/new`, `/workflows/<name>`, `/workflows/runs/<id>`,
 * `/workflows/marketplace/...`. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  views: [
    { ...workflowRunsViewManifest, component: lazy(() => import("./views/WorkflowRunsView.tsx")) },
    { ...workflowLibraryViewManifest, component: lazy(() => import("./views/WorkflowLibraryView.tsx")) },
    { ...workflowsOverviewViewManifest, component: lazy(() => import("./views/WorkflowsOverviewView.tsx")) },
    {
      ...workflowEditorViewManifest,
      params: WorkflowEditorParams,
      instanceKey: params => params.name,
      titleFor: params => params.name,
      component: lazy(() => import("./views/WorkflowEditorViews.tsx").then(module => ({ default: module.WorkflowEditorView }))),
    },
    {
      ...workflowCreateViewManifest,
      component: lazy(() => import("./views/WorkflowEditorViews.tsx").then(module => ({ default: module.WorkflowCreateView }))),
    },
    { ...workflowMarketplaceViewManifest, component: lazy(() => import("./views/WorkflowMarketplaceView.tsx")) },
    {
      ...workflowRunDetailViewManifest,
      params: WorkflowRunDetailParams,
      instanceKey: params => params.runId,
      titleFor: params => `Run ${params.runId}`,
      component: lazy(() => import("./views/WorkflowRunDetailView.tsx")),
    },
  ],
  dashboards: [
    {
      ...manifest,
      routePath: "/workflows/:workflowName?",
      // Static segments first so "marketplace" and "runs" are never mistaken for workflow names.
      extraRoutePaths: [`${MARKETPLACE_PATH}/:category?/:name?`, `${RUNS_PATH}/:runId`],
      defaultLayout: {
        kind: "row",
        sizes: [1, 3],
        children: [
          { kind: "panel", view: workflowLibraryViewManifest.id },
          {
            kind: "tabs",
            panels: [
              { kind: "panel", view: workflowsOverviewViewManifest.id },
              { kind: "panel", view: workflowRunsViewManifest.id },
            ],
          },
        ],
      },
      onNavigate({ params, pathname }, api) {
        const open = (viewId: string, viewParams?: Record<string, unknown>) =>
          openInMainArea(api, viewId, viewParams, { sidebarViews: WORKFLOWS_SIDEBAR_VIEWS });
        if (params.runId && pathname.startsWith(`${RUNS_PATH}/`)) {
          open(WORKFLOW_RUN_DETAIL_VIEW, { runId: params.runId });
          return;
        }
        if (isWorkflowMarketplacePath(pathname)) {
          open(WORKFLOW_MARKETPLACE_VIEW);
          return;
        }
        if (params.workflowName === "new") {
          open(WORKFLOW_CREATE_VIEW);
          return;
        }
        if (params.workflowName) {
          open(WORKFLOW_EDITOR_VIEW, { name: params.workflowName });
          return;
        }
        open(WORKFLOWS_OVERVIEW_VIEW);
      },
      pathForActivePanel(panel, match) {
        switch (panel?.viewId) {
          case WORKFLOW_EDITOR_VIEW:
            return typeof panel.params.name === "string" ? workflowPath(panel.params.name) : null;
          case WORKFLOW_CREATE_VIEW:
            return NEW_WORKFLOW_PATH;
          case WORKFLOW_RUN_DETAIL_VIEW:
            return typeof panel.params.runId === "string" ? runPath(panel.params.runId) : null;
          case WORKFLOW_MARKETPLACE_VIEW:
            // Back to the item that was open, not the storefront.
            return isWorkflowMarketplacePath(match.pathname) ? null : getLastMarketplacePath();
          case WORKFLOWS_OVERVIEW_VIEW:
            return WORKFLOWS_ROOT;
          default:
            return null;
        }
      },
      documentTitle: ({ params, pathname }) => {
        if (isWorkflowMarketplacePath(pathname)) return "Workflow marketplace";
        if (params.runId) return "Workflow run";
        if (params.workflowName === "new") return "New workflow";
        return params.workflowName ? `${params.workflowName} · Workflows` : "Workflows";
      },
    },
  ],
} satisfies PluginFrontendContribution;
