import type { ViewManifest } from "@tokenring-ai/one-frontend/dock/types.ts";
import type { PluginFrontendManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { Activity, GitBranch, LayoutDashboard, List, Plus, Store } from "lucide-react";

export const WORKFLOWS_DASHBOARD_ID = "workflows";

export const WORKFLOW_RUNS_VIEW = "workflow-runs";
export const WORKFLOW_LIBRARY_VIEW = "workflow-library";
export const WORKFLOWS_OVERVIEW_VIEW = "workflows-overview";
export const WORKFLOW_EDITOR_VIEW = "workflow-editor";
export const WORKFLOW_CREATE_VIEW = "workflow-create";
export const WORKFLOW_MARKETPLACE_VIEW = "workflow-marketplace";
export const WORKFLOW_RUN_DETAIL_VIEW = "workflow-run-detail";

/** Dock widget: recent runs and which step they are on. */
export const workflowRunsViewManifest = {
  id: WORKFLOW_RUNS_VIEW,
  title: "Workflow runs",
  description: "Recent workflow runs and which step they are on",
  icon: GitBranch,
  availableOn: ["home", "any"],
  defaultSize: { width: 360, height: 260 },
  minimumSize: { width: 240, height: 100 },
  tags: ["ops", "agents"],
} satisfies ViewManifest;

/** Navigator: installed workflows by category, running and recent runs. */
export const workflowLibraryViewManifest = {
  id: WORKFLOW_LIBRARY_VIEW,
  title: "Workflows",
  description: "Installed workflows, running and recent runs",
  icon: List,
  availableOn: ["any"],
  defaultSize: { width: 300, height: 400 },
  minimumSize: { width: 240, height: 160 },
  tags: ["agents"],
} satisfies ViewManifest;

export const workflowsOverviewViewManifest = {
  id: WORKFLOWS_OVERVIEW_VIEW,
  title: "Workflows overview",
  description: "Running workflows and everything you can launch",
  icon: LayoutDashboard,
  availableOn: ["any"],
  defaultSize: { width: 640, height: 480 },
  minimumSize: { width: 320, height: 200 },
  tags: ["agents"],
} satisfies ViewManifest;

export const workflowEditorViewManifest = {
  id: WORKFLOW_EDITOR_VIEW,
  title: "Workflow",
  description: "View or edit one workflow",
  icon: GitBranch,
  availableOn: [],
  instanceable: true,
  minimumSize: { width: 360, height: 240 },
  tags: ["agents"],
} satisfies ViewManifest;

export const workflowCreateViewManifest = {
  id: WORKFLOW_CREATE_VIEW,
  title: "New workflow",
  description: "Create a workflow",
  icon: Plus,
  availableOn: [],
  minimumSize: { width: 360, height: 240 },
} satisfies ViewManifest;

export const workflowMarketplaceViewManifest = {
  id: WORKFLOW_MARKETPLACE_VIEW,
  title: "Workflow marketplace",
  description: "Install community workflows from the marketplace registry",
  icon: Store,
  availableOn: ["any"],
  defaultSize: { width: 640, height: 480 },
  minimumSize: { width: 320, height: 200 },
  tags: ["agents"],
} satisfies ViewManifest;

export const workflowRunDetailViewManifest = {
  id: WORKFLOW_RUN_DETAIL_VIEW,
  title: "Workflow run",
  description: "Live progress of one workflow run",
  icon: Activity,
  availableOn: [],
  instanceable: true,
  defaultSize: { width: 420, height: 480 },
  minimumSize: { width: 280, height: 200 },
  tags: ["agents"],
} satisfies ViewManifest;

/** Views that act as the Workflows dashboard's navigator; editors never tab into their group. */
export const WORKFLOWS_SIDEBAR_VIEWS: readonly string[] = [WORKFLOW_LIBRARY_VIEW];

/**
 * Metadata for the workflows dashboard shipped by this plugin. The frontend
 * merges this into its registry and derives the SPA server routes from it.
 */
export default {
  id: WORKFLOWS_DASHBOARD_ID,
  path: "/workflows",
  label: "Workflows",
  shortLabel: "WF",
  description: "Launch and monitor automated workflows",
  group: "Build",
  icon: GitBranch,
  iconClass: "text-cyan-500",
  gradient: "from-cyan-500 to-teal-600",
  defaultPinned: true,
  views: [
    workflowRunsViewManifest,
    workflowLibraryViewManifest,
    workflowsOverviewViewManifest,
    workflowEditorViewManifest,
    workflowCreateViewManifest,
    workflowMarketplaceViewManifest,
    workflowRunDetailViewManifest,
  ],
} satisfies PluginFrontendManifest;
