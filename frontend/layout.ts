import type { AppManifest } from "@tokenring-ai/one-frontend/layout/types.ts";
import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { GitBranch } from "lucide-react";
import {
  WORKFLOW_APP_ID,
  WORKFLOW_APP_PATH,
  WORKFLOW_CREATE_VIEW_ID,
  WORKFLOW_EDITOR_VIEW_ID,
  WORKFLOW_LIBRARY_VIEW_ID,
  WORKFLOW_RUN_DETAIL_VIEW_ID,
  WORKFLOW_RUNS_VIEW_ID,
  WORKFLOW_VIEW_KIND,
  WORKFLOWS_OVERVIEW_VIEW_ID,
} from "./ids.ts";

/**
 * Workflows: the library on the left; the main tabs hold what you work on:
 * editors, run details and agent chats, starting from the Runs page (running
 * and recent runs), which gives way to the first of them. A run's chat opens
 * beside the run. Community workflows are in the Marketplace app.
 * Routes: `/workflows`, `/workflows/new`, `/workflows/<name>`, `/workflows/runs/<id>`.
 */
export const WORKFLOW_APP: AppManifest = {
  id: WORKFLOW_APP_ID,
  path: WORKFLOW_APP_PATH,
  label: "Workflows",
  shortLabel: "WF",
  description: "Run and monitor automated workflows",
  group: "Build",
  icon: GitBranch,
  iconClass: "text-cyan-500",
  gradient: "from-cyan-500 to-teal-600",
  views: [
    WORKFLOW_LIBRARY_VIEW_ID,
    WORKFLOWS_OVERVIEW_VIEW_ID,
    WORKFLOW_RUNS_VIEW_ID,
    WORKFLOW_EDITOR_VIEW_ID,
    WORKFLOW_CREATE_VIEW_ID,
    WORKFLOW_RUN_DETAIL_VIEW_ID,
    "chat",
  ],
  primaryKind: WORKFLOW_VIEW_KIND,
  // 2: chats moved into the main tabs, the Runs tab folded into the landing page.
  layoutVersion: 2,
  layout: {
    split: "row",
    sizes: [1, 4],
    children: [
      { presenter: "single", accepts: ["navigator"], items: [WORKFLOW_LIBRARY_VIEW_ID] },
      { presenter: "tabs", accepts: [WORKFLOW_VIEW_KIND, "agent", "widget"], items: [WORKFLOWS_OVERVIEW_VIEW_ID], primary: true },
    ],
  },
};

export default {
  apps: [WORKFLOW_APP],
  kinds: [{ id: WORKFLOW_VIEW_KIND, label: "Workflows", plural: "workflows" }],
  // Shown on Home too (in its widget accordion), as on the old home dashboard.
  extends: [{ app: "home", views: [WORKFLOW_RUNS_VIEW_ID], into: "widget" }],
} satisfies PluginLayoutManifest;
