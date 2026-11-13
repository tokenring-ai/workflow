import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { usePaneLink } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { WorkflowRun } from "@tokenring-ai/workflow/schema";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WORKFLOW_CREATE_VIEW_ID, WORKFLOW_EDITOR_VIEW_ID, WORKFLOW_RUN_DETAIL_VIEW_ID, WORKFLOWS_OVERVIEW_VIEW_ID } from "../ids.ts";
import { MARKETPLACE_PATH } from "./paths.ts";

/**
 * Navigation between the Workflows views on the layout engine. Opening a view
 * navigates to its URL (the engine opens and focuses its tab).
 */
export function useWorkflowLayoutNavigation() {
  const open = usePaneLink();
  const navigate = useNavigate();

  // The run page opens its agent's chat beside itself (useAttachedAgentChat), so the step list and the conversation share a screen.
  const openRun = useCallback((run: Pick<WorkflowRun, "id" | "agentId">) => open(WORKFLOW_RUN_DETAIL_VIEW_ID, { runId: run.id }), [open]);

  return {
    openOverview: useCallback(() => open(WORKFLOWS_OVERVIEW_VIEW_ID), [open]),
    openWorkflow: useCallback((name: string) => open(WORKFLOW_EDITOR_VIEW_ID, { name }), [open]),
    openCreate: useCallback(() => open(WORKFLOW_CREATE_VIEW_ID), [open]),
    /** Community workflows are browsed and installed in the Marketplace app. */
    openMarketplace: useCallback(() => void navigate(MARKETPLACE_PATH), [navigate]),
    openRun,
    /** Opens (or focuses) the chat panel for an agent beside the workflows. */
    openAgentChat: useCallback((agentId: string) => open("chat", { agentId }), [open]),
  };
}

/** Launches a workflow on a new agent and opens the workflow so the run shows up in its editor. */
export function useWorkflowLaunch() {
  const { openWorkflow } = useWorkflowLayoutNavigation();
  const [launching, setLaunching] = useState<string | null>(null);

  const launch = useCallback(
    /** `headless` runs unattended: the agent never stops to ask the user anything. */
    async (name: string, options?: { headless?: boolean }) => {
      setLaunching(name);
      try {
        await workflowRPCClient.spawnWorkflow({ name, headless: options?.headless ?? false });
        openWorkflow(name);
        toastManager.success(`Launched "${name}" — watch the run in its panel`, { duration: 3000 });
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
      } finally {
        setLaunching(null);
      }
    },
    [openWorkflow],
  );

  return { launch, launching };
}
