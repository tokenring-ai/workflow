import FilterTabs from "@tokenring-ai/one-frontend/components/ui/FilterTabs.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useDashboardApi } from "@tokenring-ai/one-frontend/dock/DashboardApiContext.tsx";
import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import type { ViewParams } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { WorkflowRun } from "@tokenring-ai/workflow/schema";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import {
  WORKFLOW_CREATE_VIEW,
  WORKFLOW_EDITOR_VIEW,
  WORKFLOW_MARKETPLACE_VIEW,
  WORKFLOW_RUN_DETAIL_VIEW,
  WORKFLOWS_DASHBOARD_ID,
  WORKFLOWS_OVERVIEW_VIEW,
  WORKFLOWS_SIDEBAR_VIEWS,
} from "../manifest.ts";
import { isSameDraft, type WorkflowDraft } from "./drafts.ts";
import { MARKETPLACE_PATH, NEW_WORKFLOW_PATH, runPath, WORKFLOWS_ROOT, workflowPath } from "./paths.ts";

/**
 * Hooks and small components shared by the Workflows dashboard views. Each
 * view is its own React subtree, so shared state is either persisted
 * (drafts) or kept in tiny module stores (the create form's name).
 */

/** Draft key for the not-yet-created workflow; can never collide with a real name. */
export const NEW_DRAFT_KEY = "__new__";

/**
 * Navigation between the Workflows views. Each action opens the target panel
 * in the main area right away (so a closed panel re-opens even when the URL
 * does not change) and then updates the URL.
 */
export function useWorkflowsNavigation() {
  const navigate = useNavigate();
  const dashboard = useDashboardApi();
  const onDashboard = dashboard.dashboardId === WORKFLOWS_DASHBOARD_ID;

  const go = useCallback(
    (viewId: string, params: ViewParams | undefined, path: string, options?: { replace?: boolean }) => {
      if (onDashboard) openInMainArea(dashboard, viewId, params, { sidebarViews: WORKFLOWS_SIDEBAR_VIEWS });
      void navigate(path, options?.replace ? { replace: true } : undefined);
    },
    [dashboard, navigate, onDashboard],
  );

  const openRun = useCallback(
    (run: Pick<WorkflowRun, "id" | "agentId">) => {
      go(WORKFLOW_RUN_DETAIL_VIEW, { runId: run.id }, runPath(run.id));
      // The run's agent chat docks beside it so the conversation and the step list share a screen.
      if (run.agentId && onDashboard) dashboard.openView("chat", { agentId: run.agentId }, { position: "right", focus: false });
    },
    [dashboard, go, onDashboard],
  );

  return {
    openOverview: useCallback(() => go(WORKFLOWS_OVERVIEW_VIEW, undefined, WORKFLOWS_ROOT), [go]),
    openWorkflow: useCallback((name: string, options?: { replace?: boolean }) => go(WORKFLOW_EDITOR_VIEW, { name }, workflowPath(name), options), [go]),
    openCreate: useCallback(() => go(WORKFLOW_CREATE_VIEW, undefined, NEW_WORKFLOW_PATH), [go]),
    openMarketplace: useCallback(() => go(WORKFLOW_MARKETPLACE_VIEW, undefined, MARKETPLACE_PATH), [go]),
    openRun,
    /** Opens (or focuses) the chat panel for an agent without leaving the dashboard. */
    openAgentChat: useCallback(
      (agentId: string) => {
        if (onDashboard) dashboard.openView("chat", { agentId }, { position: "right" });
        else void navigate(`/agent/${agentId}`);
      },
      [dashboard, navigate, onDashboard],
    ),
  };
}

/** Launches a workflow on a new agent and opens the workflow so the run shows up in its editor. */
export function useWorkflowLaunch() {
  const { openWorkflow } = useWorkflowsNavigation();
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

/** Drafts persist across reloads (and are shared between panels); entries are dropped on save/revert/delete. */
export function useWorkflowDrafts() {
  const [drafts, setDrafts] = useLocalStorageState<Record<string, WorkflowDraft>>(
    "workflows:drafts",
    {},
    {
      deserialize: raw => {
        try {
          const parsed: unknown = JSON.parse(raw);
          return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, WorkflowDraft>) : {};
        } catch {
          return {};
        }
      },
    },
  );

  const setDraft = useCallback((key: string, next: WorkflowDraft) => setDrafts(prev => ({ ...prev, [key]: next })), [setDrafts]);
  const clearDraft = useCallback(
    (key: string) =>
      setDrafts(prev => {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }),
    [setDrafts],
  );

  /**
   * Drops the draft only if it still matches what was just saved: edits typed
   * while the save was in flight stay as the new draft.
   */
  const clearDraftIfUnchanged = useCallback(
    (key: string, saved: WorkflowDraft) =>
      setDrafts(prev => {
        const current = prev[key];
        if (!current || !isSameDraft(current, saved)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }),
    [setDrafts],
  );

  return { drafts, setDraft, clearDraft, clearDraftIfUnchanged };
}

// ─── Name typed into the create form (seeded by "clone") ───────────────────────

let newWorkflowName = "";
const nameListeners = new Set<() => void>();

export function setNewWorkflowName(name: string): void {
  if (name === newWorkflowName) return;
  newWorkflowName = name;
  for (const listener of nameListeners) listener();
}

export function useNewWorkflowName(): string {
  return useSyncExternalStore(
    listener => {
      nameListeners.add(listener);
      return () => {
        nameListeners.delete(listener);
      };
    },
    () => newWorkflowName,
    () => newWorkflowName,
  );
}

/** Installed / Marketplace switch shared by the overview and marketplace views. */
export function WorkflowTabs({
  active,
  marketplaceCount,
  installedCount,
  onChange,
}: {
  active: "installed" | "marketplace";
  installedCount: number;
  marketplaceCount: number | undefined;
  onChange: (tab: "installed" | "marketplace") => void;
}) {
  return (
    <FilterTabs
      tabs={[
        { id: "installed", label: "Installed", count: installedCount },
        { id: "marketplace", label: "Marketplace", ...(marketplaceCount === undefined ? {} : { count: marketplaceCount }) },
      ]}
      value={active}
      onChange={onChange}
      showZeroCounts
      className="bg-secondary"
    />
  );
}
