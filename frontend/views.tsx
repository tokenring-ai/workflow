import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Activity, GitBranch, History, List, Plus } from "lucide-react";
import { lazy } from "react";
import {
  WORKFLOW_CREATE_VIEW_ID,
  WORKFLOW_EDITOR_VIEW_ID,
  WORKFLOW_LIBRARY_VIEW_ID,
  WORKFLOW_RUN_DETAIL_VIEW_ID,
  WORKFLOW_RUNS_VIEW_ID,
  WORKFLOW_VIEW_KIND,
  WORKFLOWS_OVERVIEW_VIEW_ID,
} from "./ids.ts";

const WorkflowLibraryPane = lazy(() => import("./panes/WorkflowLibraryPane.tsx"));
const WorkflowsOverviewPane = lazy(() => import("./panes/WorkflowsOverviewPane.tsx"));
const WorkflowRunsPane = lazy(() => import("./panes/WorkflowRunsPane.tsx"));
const WorkflowEditorPane = lazy(() => import("./panes/WorkflowEditorPanes.tsx").then(module => ({ default: module.WorkflowEditorPane })));
const WorkflowCreatePane = lazy(() => import("./panes/WorkflowEditorPanes.tsx").then(module => ({ default: module.WorkflowCreatePane })));
const WorkflowRunDetailPane = lazy(() => import("./panes/WorkflowRunDetailPane.tsx"));

export default {
  views: [
    // Navigator: installed workflows by category, with a dot on the ones running.
    defineView({
      id: WORKFLOW_LIBRARY_VIEW_ID,
      kind: "navigator",
      title: "Workflows",
      description: "Installed workflows by category",
      icon: List,
      closable: false,
      component: WorkflowLibraryPane,
    }),
    // `/workflows`: what is running and what ran. Gives way to the first editor, run or chat.
    defineView({
      id: WORKFLOWS_OVERVIEW_VIEW_ID,
      kind: WORKFLOW_VIEW_KIND,
      title: "Runs",
      description: "Running and recent workflow runs",
      icon: History,
      route: "",
      landing: true,
      component: WorkflowsOverviewPane,
    }),
    // Widget (also a Home-style summary): recent runs and which step they are on. No route.
    defineView({
      id: WORKFLOW_RUNS_VIEW_ID,
      kind: "widget",
      title: "Workflow runs",
      description: "Recent workflow runs and which step they are on",
      icon: GitBranch,
      component: WorkflowRunsPane,
    }),
    // Static segments (`new`, `runs/:runId`) win over the workflow-name route below.
    defineView({
      id: WORKFLOW_CREATE_VIEW_ID,
      kind: WORKFLOW_VIEW_KIND,
      title: "New workflow",
      description: "Create a workflow",
      icon: Plus,
      route: "new",
      component: WorkflowCreatePane,
    }),
    defineView({
      id: WORKFLOW_RUN_DETAIL_VIEW_ID,
      kind: WORKFLOW_VIEW_KIND,
      title: params => `Run ${params.runId ?? ""}`.trim(),
      description: "Live progress of one workflow run",
      icon: Activity,
      route: "runs/:runId",
      instanceKey: params => params.runId ?? "",
      component: WorkflowRunDetailPane,
    }),
    // One panel for the storefront and whichever item the URL names (it follows the URL).
    defineView({
      id: WORKFLOW_EDITOR_VIEW_ID,
      kind: WORKFLOW_VIEW_KIND,
      title: params => params.name ?? "Workflow",
      description: "View or edit one workflow",
      icon: GitBranch,
      route: ":name",
      instanceKey: params => params.name ?? "",
      component: WorkflowEditorPane,
    }),
  ],
} satisfies PluginLayoutViews;
