import MarketplaceItemDetail from "@tokenring-ai/marketplace/frontend/features/marketplace/MarketplaceItemDetail.tsx";
import MarketplaceStorefront from "@tokenring-ai/marketplace/frontend/features/marketplace/MarketplaceStorefront.tsx";
import { useEmbeddedMarketplace } from "@tokenring-ai/marketplace/frontend/features/marketplace/useEmbeddedMarketplace.ts";
import ChatDock from "@tokenring-ai/one-frontend/components/chat/ChatDock.tsx";
import type { ExtraChatAttachment } from "@tokenring-ai/one-frontend/components/chat/ChatFooter.tsx";
import WorkspaceShell from "@tokenring-ai/one-frontend/components/layout/WorkspaceShell.tsx";
import AppPageHeader from "@tokenring-ai/one-frontend/components/ui/AppPageHeader.tsx";
import ConfirmModal from "@tokenring-ai/one-frontend/components/ui/ConfirmModal.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import FilterTabs from "@tokenring-ai/one-frontend/components/ui/FilterTabs.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { formatStepLabel, type WorkflowStep } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import { useEntityDelete } from "@tokenring-ai/one-frontend/hooks/useEntityDelete.ts";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { usePendingAction } from "@tokenring-ai/one-frontend/hooks/usePendingAction.tsx";
import { useRemoteChangeDetection } from "@tokenring-ai/one-frontend/hooks/useRemoteChangeDetection.ts";
import { useStaleRouteRedirect } from "@tokenring-ai/one-frontend/hooks/useStaleRouteRedirect.ts";
import { toastOnReject } from "@tokenring-ai/one-frontend/lib/toastOnReject.ts";
import { runOrConfirm } from "@tokenring-ai/one-frontend/lib/uiPreferences.ts";
import { useAgentTypes, useAvailableCommands, useTypedSWR, useWorkflowRuns, useWorkflows, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { GitBranch, Loader2, Plus, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isRunActive, isRunFinished, RunningCountBadge, RunningWorkflowCard, sortRunsNewestFirst, WorkflowCard } from "./components/RunPanels.tsx";
import WorkflowEditor from "./components/WorkflowEditor.tsx";
import { WorkflowSidebar } from "./components/WorkflowSidebar.tsx";
import {
  cloneDraft,
  emptyDraft,
  isSameDraft,
  MARKETPLACE_PATH,
  NAME_PATTERN,
  normalizeDraft,
  toDraft,
  uniqueCloneName,
  type WorkflowDraft,
} from "./lib/drafts.ts";

/** Draft key for the not-yet-created workflow; can never collide with a real name. */
const NEW_DRAFT_KEY = "__new__";

function WorkflowsEmptyState({ directory, onNew, onBrowseMarketplace }: { directory: string | undefined; onNew: () => void; onBrowseMarketplace: () => void }) {
  return (
    <EmptyState
      variant="card"
      icon={GitBranch}
      title="No workflows yet"
      hint="Workflows are ordered lists of commands run by an agent. Write one yourself, or install one from the marketplace."
      ctaLabel="New workflow"
      onCta={onNew}
      action={
        <button
          type="button"
          onClick={onBrowseMarketplace}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-primary text-xs font-medium text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring"
        >
          <Store className="w-3.5 h-3.5" /> Browse the marketplace
        </button>
      }
    >
      {directory && (
        <p className="text-xs text-muted mt-2">
          Stored as YAML files in <code className="font-mono text-secondary">{directory}</code>
        </p>
      )}
    </EmptyState>
  );
}

/** Installed / Marketplace switch shared by the overview and marketplace panes. */
function WorkflowTabs({
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

export default function WorkflowsApp() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The marketplace params come from /workflows/marketplace/:category/:name; the embedded storefront
  // is pinned to workflows, so the item id is those two segments with the `workflow` kind reattached.
  const {
    workflowName: routeWorkflowName,
    category: marketplaceCategory,
    name: marketplaceName,
  } = useParams<{ workflowName?: string; category?: string; name?: string }>();

  const isMarketplaceRoute = pathname === MARKETPLACE_PATH || pathname.startsWith(`${MARKETPLACE_PATH}/`);
  const workflows = useWorkflows();
  const agentTypes = useAgentTypes();
  const availableCommands = useAvailableCommands();
  const commandList = useMemo(() => availableCommands.data ?? [], [availableCommands.data]);
  const workflowRuns = useWorkflowRuns();
  const workflowDirectory = useTypedSWR("/workflow/getWorkflowDirectory", () => workflowRPCClient.getWorkflowDirectory({}));

  // Drafts persist across reloads; entries are dropped on save/revert/delete.
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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // The run the chat dock is attached to; null id just means "no dock".
  const [focusedRunId, setFocusedRunId] = useLocalStorageState<string | null>("workflows:focusedRun", null);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);
  /** Run ids whose auto-attached workflow chip the user removed this session. */
  const [dismissedAttachments, setDismissedAttachments] = useState<Record<string, true>>({});

  const workflowList = (workflows.data ?? []) as Workflow[];
  const selectedWorkflow = useMemo(
    () => (routeWorkflowName && !isMarketplaceRoute ? (workflowList.find(w => w.name === routeWorkflowName) ?? null) : null),
    [workflowList, routeWorkflowName, isMarketplaceRoute],
  );

  // Kept off the network until the marketplace is actually on screen.
  const marketplace = useEmbeddedMarketplace({
    kind: "workflow",
    basePath: MARKETPLACE_PATH,
    active: isMarketplaceRoute,
    routeCategory: marketplaceCategory,
    routeName: marketplaceName,
    onInstalled: () => void workflows.mutate(),
  });

  const categories = useMemo(() => [...new Set(workflowList.map(w => w.category).filter(Boolean))].sort(), [workflowList]);

  const allRuns = useMemo(() => sortRunsNewestFirst((workflowRuns.data?.runs ?? []) as WorkflowRun[]), [workflowRuns.data]);
  const activeRuns = useMemo(() => allRuns.filter(isRunActive), [allRuns]);
  const recentFinishedRuns = useMemo(() => allRuns.filter(isRunFinished).slice(0, 8), [allRuns]);
  const selectedWorkflowRuns = useMemo(
    () => (selectedWorkflow ? allRuns.filter(run => run.workflowName === selectedWorkflow.name) : []),
    [allRuns, selectedWorkflow],
  );
  // The dock attaches to the focused run's agent while it is alive; otherwise the app renders undocked.
  const focusedRun = useMemo(() => {
    if (isMarketplaceRoute) return null;
    const byId = (focusedRunId ? activeRuns.find(run => run.id === focusedRunId) : null) ?? null;
    return byId ?? activeRuns[0] ?? null;
  }, [activeRuns, focusedRunId, isMarketplaceRoute]);
  const dockAgentId = focusedRun?.agentId ?? null;

  const dirtyNames = useMemo(() => {
    const names = new Set<string>();
    for (const workflow of workflowList) {
      const draft = drafts[workflow.name];
      if (draft && !isSameDraft(draft, toDraft(workflow))) names.add(workflow.name);
    }
    return names;
  }, [drafts, workflowList]);

  // A route pointing at a workflow that no longer exists (deleted elsewhere, bad deep-link) resets to the empty state.
  useStaleRouteRedirect({
    routeParam: isMarketplaceRoute ? undefined : routeWorkflowName,
    entity: selectedWorkflow,
    isLoading: workflows.isLoading,
    hasError: !!workflows.error,
    navigate,
    fallbackPath: "/workflows",
    entityLabel: "Workflow",
  });

  const draftKey = creating ? NEW_DRAFT_KEY : (selectedWorkflow?.name ?? null);
  const savedDraft = useMemo(() => (creating ? emptyDraft() : selectedWorkflow ? toDraft(selectedWorkflow) : null), [creating, selectedWorkflow]);
  const draft = draftKey !== null ? (drafts[draftKey] ?? savedDraft) : null;
  const isDirty = draft !== null && savedDraft !== null && !isSameDraft(draft, savedDraft);

  const setDraft = useCallback(
    (next: WorkflowDraft) => {
      if (draftKey === null) return;
      setDrafts(prev => ({ ...prev, [draftKey]: next }));
    },
    [draftKey, setDrafts],
  );

  const clearDraft = useCallback(
    (key: string) => {
      setDrafts(prev => {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [setDrafts],
  );

  const refreshWorkflows = useCallback(() => {
    // List refresh is best-effort; a failed revalidate must not undo a successful save/delete.
    toastOnReject(Promise.resolve(workflows.mutate()), {
      message: err => `Failed to refresh workflow list: ${formatError(err)}`,
      duration: 4000,
    });
  }, [workflows]);

  // When an agent (or CLI) edits the open workflow on disk, reload it if the user has no unsaved
  // edits; with unsaved edits the poller stays quiet so nothing is clobbered.
  const { markLoaded } = useRemoteChangeDetection({
    documentKey: !creating && selectedWorkflow ? selectedWorkflow.name : null,
    isDocumentReady: !creating && selectedWorkflow !== null,
    isDirty,
    strategy: {
      type: "polling",
      poll: async () => {
        if (!selectedWorkflow) return null;
        const { workflow } = await workflowRPCClient.getWorkflow({ name: selectedWorkflow.name });
        return workflow ? { updatedAt: workflow.updatedAt } : null;
      },
    },
    onRemoteChange: () => {
      refreshWorkflows();
      if (selectedWorkflow) clearDraft(selectedWorkflow.name);
      toastManager.warning("Workflow was updated on disk — reloaded the latest version.", { duration: 4000 });
    },
  });
  // Track the loaded version so the poller only fires on real remote changes.
  useEffect(() => {
    markLoaded(selectedWorkflow?.updatedAt ?? null);
  }, [markLoaded, selectedWorkflow?.updatedAt, creating]);

  // Unsaved-edit guard for navigation that would drop the draft.
  const { pendingAction, queueAction, PendingDialog } = usePendingAction<{ run: () => void }>({ isDirty });
  const guarded = useCallback(
    (run: () => void) => {
      if (queueAction({ run })) return;
      run();
    },
    [queueAction],
  );

  const handleGoOverview = useCallback(() => {
    guarded(() => {
      setCreating(false);
      void navigate("/workflows");
    });
  }, [guarded, navigate]);

  const handleSelect = useCallback(
    (name: string) => {
      guarded(() => {
        setCreating(false);
        void navigate(`/workflows/${encodeURIComponent(name)}`);
      });
    },
    [guarded, navigate],
  );

  // Keeps any in-progress new-workflow draft (including its name) so switching away and back doesn't lose it.
  const handleNew = useCallback(() => {
    guarded(() => {
      setCreating(true);
      void navigate("/workflows");
    });
  }, [guarded, navigate]);

  const handleCancelCreate = useCallback(() => {
    setCreating(false);
    clearDraft(NEW_DRAFT_KEY);
    setNewName("");
    void navigate("/workflows", { replace: true });
  }, [clearDraft, navigate]);

  /** Opens the create form pre-filled from the currently viewed workflow (including unsaved edits). */
  const handleClone = useCallback(() => {
    if (!draft || !selectedWorkflow) return;
    const cloned = cloneDraft(draft);
    const baseDisplay = cloned.displayName.trim();
    cloned.displayName = baseDisplay ? `${baseDisplay} (copy)` : "";
    const name = uniqueCloneName(
      selectedWorkflow.name,
      workflowList.map(workflow => workflow.name),
    );
    setDrafts(prev => ({ ...prev, [NEW_DRAFT_KEY]: cloned }));
    setNewName(name);
    setCreating(true);
    void navigate("/workflows");
  }, [draft, navigate, selectedWorkflow, workflowList, setDrafts]);

  const entityDelete = useEntityDelete({
    currentRouteId: routeWorkflowName ?? null,
    navigateToOverview: () => void navigate("/workflows"),
    refreshList: refreshWorkflows,
    clearLocalState: clearDraft,
    successMessage: name => `Workflow "${name}" deleted`,
  });

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const name = creating ? newName.trim() : (selectedWorkflow?.name ?? "");
    if (!name) return;
    if (creating && !NAME_PATTERN.test(name)) return;
    if (creating && workflowList.some(workflow => workflow.name === name)) {
      toastManager.error(`A workflow named "${name}" already exists`, { duration: 4000 });
      return;
    }

    setSaving(true);
    try {
      const payload = normalizeDraft(draft);
      if (creating) {
        await workflowRPCClient.createWorkflow({ name, workflow: payload });
      } else {
        await workflowRPCClient.updateWorkflow({ name, workflow: payload });
      }
      // RPC succeeded — clear draft and navigate before revalidating the list.
      clearDraft(creating ? NEW_DRAFT_KEY : name);
      if (creating) {
        setCreating(false);
        setNewName("");
        void navigate(`/workflows/${encodeURIComponent(name)}`);
      }
      toastManager.success(`Workflow "${name}" saved`, { duration: 3000 });
      refreshWorkflows();
    } catch (error) {
      toastManager.error(formatError(error), { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }, [clearDraft, creating, draft, navigate, newName, refreshWorkflows, selectedWorkflow, workflowList]);

  // Cmd/Ctrl+S saves whenever an editor is open.
  useKeyboardShortcuts([{ key: "s", handler: () => void handleSave() }]);

  const handleDelete = useCallback(
    async (name: string) => {
      setDeleteTarget(null);
      await entityDelete.deleteEntity(name, name, async () => {
        const { success } = await workflowRPCClient.deleteWorkflow({ name });
        if (!success) throw new Error(`Workflow "${name}" could not be deleted`);
      });
    },
    [entityDelete],
  );

  const handleLaunch = useCallback(
    async (name: string) => {
      setLaunching(name);
      try {
        await workflowRPCClient.spawnWorkflow({ name, headless: false });
        // Stay in the app: the run appears under "Running" and the dock attaches to its agent.
        void navigate(`/workflows/${encodeURIComponent(name)}`);
        toastManager.success(`Launched "${name}" — watch the run below`, { duration: 3000 });
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
      } finally {
        setLaunching(null);
      }
    },
    [navigate],
  );

  const handleCancelRun = useCallback(async (run: WorkflowRun) => {
    setCancellingRunId(run.id);
    try {
      const { success } = await workflowRPCClient.cancelRun({ runId: run.id });
      if (!success) toastManager.warning("That run already finished.", { duration: 3000 });
      else toastManager.success(`Cancelled "${runTitleFromRun(run)}"`, { duration: 3000 });
    } catch (error) {
      toastManager.error(formatError(error), { duration: 5000 });
    } finally {
      setCancellingRunId(null);
    }
  }, []);

  const openAgent = useCallback(
    (id: string) => {
      void navigate(`/agent/${id}`);
    },
    [navigate],
  );

  const watchRun = useCallback(
    (run: WorkflowRun) => {
      setFocusedRunId(run.id);
      void navigate(`/workflows/${encodeURIComponent(run.workflowName)}`);
    },
    [navigate, setFocusedRunId],
  );

  // While a run is focused, attach its workflow definition to the next chat message so the
  // agent (and the user) share the same picture of the steps. Removable like any chip.
  const extraAttachments: ExtraChatAttachment[] = useMemo(() => {
    if (!focusedRun || dismissedAttachments[focusedRun.id]) return [];
    const steps: WorkflowStep[] = focusedRun.steps;
    const body = [
      `# Workflow: ${focusedRun.displayName || focusedRun.workflowName}`,
      focusedRun.steps.length > 0 ? `Steps (${steps.length}):` : "(no steps)",
      ...steps.map((step, index) => `${index + 1}. ${formatStepLabel(step)}`),
    ].join("\n");
    return [
      {
        id: `workflow:${focusedRun.workflowName}`,
        label: `${focusedRun.workflowName}.yaml`,
        attachment: {
          name: `${focusedRun.workflowName}.yaml`,
          description: "The workflow this agent is currently running.",
          encoding: "text",
          mimeType: "text/markdown",
          body,
        },
      },
    ];
  }, [dismissedAttachments, focusedRun]);

  const handleBrowseMarketplace = useCallback(() => {
    guarded(() => {
      setCreating(false);
      void navigate(MARKETPLACE_PATH);
    });
  }, [guarded, navigate]);

  const tabs = (
    <WorkflowTabs
      active={isMarketplaceRoute ? "marketplace" : "installed"}
      installedCount={workflowList.length}
      marketplaceCount={marketplace.count}
      onChange={tab => (tab === "marketplace" ? handleBrowseMarketplace() : handleGoOverview())}
    />
  );

  const detailPane = (() => {
    if (marketplace.id) {
      return (
        <MarketplaceItemDetail
          id={marketplace.id}
          data={marketplace.detail}
          isLoading={marketplace.detailLoading}
          error={marketplace.detailError}
          registryName={marketplace.registryName}
          installing={marketplace.installingId === marketplace.id}
          onRetry={marketplace.retryDetail}
          onInstall={marketplace.onInstallAs}
          onBack={handleBrowseMarketplace}
          onOpenInstalled={marketplace.openInstalled}
        />
      );
    }

    if (isMarketplaceRoute) {
      return (
        <MarketplaceStorefront
          header={
            <>
              <AppPageHeader
                title="Workflows"
                subtitle={`Install community workflows from ${marketplace.registryName}`}
                icon={<GitBranch />}
                iconGradient="from-cyan-500 to-blue-600"
                size="compact"
              />
              {tabs}
            </>
          }
          kinds={["workflow"]}
          items={marketplace.entries}
          registryName={marketplace.registryName}
          unavailableMessage={marketplace.unavailableMessage}
          isLoading={marketplace.isLoading}
          error={marketplace.error}
          refreshing={marketplace.refreshing}
          installedById={marketplace.installedById}
          installingId={marketplace.installingId}
          onRefresh={marketplace.onRefresh}
          onView={marketplace.onView}
          onInstall={marketplace.onInstall}
        />
      );
    }

    if (draft && (creating || selectedWorkflow)) {
      return (
        <WorkflowEditor
          workflowName={creating ? null : (selectedWorkflow?.name ?? null)}
          creating={creating}
          nameValue={newName}
          onNameChange={setNewName}
          draft={draft}
          onDraftChange={setDraft}
          savedWorkflow={creating ? null : selectedWorkflow}
          isDirty={isDirty}
          activeRun={creating ? null : (activeRuns.find(run => run.workflowName === selectedWorkflow?.name) ?? null)}
          workflowRuns={creating ? [] : selectedWorkflowRuns}
          categories={categories}
          agentTypes={agentTypes.data ?? []}
          commands={commandList}
          saving={saving}
          launching={launching === selectedWorkflow?.name}
          onSave={() => void handleSave()}
          onRevert={() => draftKey !== null && clearDraft(draftKey)}
          onDelete={() =>
            selectedWorkflow &&
            runOrConfirm(
              "Delete workflow",
              () => setDeleteTarget(selectedWorkflow.name),
              () => void handleDelete(selectedWorkflow.name),
            )
          }
          onClone={handleClone}
          onLaunch={() => selectedWorkflow && void handleLaunch(selectedWorkflow.name)}
          onCancelCreate={handleCancelCreate}
          onOpenAgent={openAgent}
          onCancelRun={run => void handleCancelRun(run)}
          cancellingRunId={cancellingRunId}
        />
      );
    }

    return renderOverview();
  })();

  // Render function (not a component) so it can close over the hooks above without remounting.
  function renderOverview() {
    // Plain computation — this runs conditionally, so it must not contain hooks.
    const runningByWorkflow = (() => {
      const counts = new Map<string, number>();
      for (const run of activeRuns) counts.set(run.workflowName, (counts.get(run.workflowName) ?? 0) + 1);
      return counts;
    })();

    const hasWorkflows = workflowList.length > 0;

    return (
      <div className="h-full flex flex-col bg-primary">
        <AppPageHeader
          title="Workflows"
          subtitle="Create, manage, and monitor workflow runs"
          icon={<GitBranch />}
          iconGradient="from-cyan-500 to-blue-600"
          size="compact"
        >
          <button
            type="button"
            onClick={handleNew}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer focus-ring"
          >
            <Plus className="w-3.5 h-3.5" /> New workflow
          </button>
        </AppPageHeader>

        {tabs}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-xs font-bold text-amber-600 dark:text-amber-500/90 uppercase tracking-widest">Running workflows</h2>
                <RunningCountBadge count={activeRuns.length} />
              </div>
              {activeRuns.length === 0 ? (
                <p className="px-1 text-xs text-muted">No workflows are running yet — launch one below.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {activeRuns.map(run => (
                    <RunningWorkflowCard key={run.id} run={run} onOpen={() => watchRun(run)} />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-xs font-bold text-accent/90 uppercase tracking-widest">Launch a workflow</h2>
                {hasWorkflows && <span className="text-xs text-muted">{workflowList.length} installed</span>}
              </div>
              {workflows.isLoading && !hasWorkflows ? (
                <LoadingIndicator />
              ) : workflows.error && !hasWorkflows ? (
                <ErrorState title="Unable to load workflows" error={workflows.error} onRetry={() => void workflows.mutate()} variant="page" className="py-8" />
              ) : hasWorkflows ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {workflowList.map(workflow => (
                    <WorkflowCard
                      key={workflow.name}
                      workflow={workflow}
                      runningCount={runningByWorkflow.get(workflow.name) ?? 0}
                      launching={launching === workflow.name}
                      onView={() => handleSelect(workflow.name)}
                      onLaunch={() => void handleLaunch(workflow.name)}
                    />
                  ))}
                </div>
              ) : (
                <WorkflowsEmptyState directory={workflowDirectory.data?.directory} onNew={handleNew} onBrowseMarketplace={handleBrowseMarketplace} />
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-primary">
      <WorkspaceShell
        appId="workflows"
        title="Workflows"
        navigationLabel="Workflows and runs"
        hasSelection={creating || selectedWorkflow !== null || isMarketplaceRoute}
        className="flex-1"
        navigation={
          <WorkflowSidebar
            workflows={workflowList}
            isLoading={workflows.isLoading}
            loadError={workflows.error}
            onRetryLoad={() => void workflows.mutate()}
            selectedName={selectedWorkflow?.name ?? null}
            creating={creating}
            dirtyNames={dirtyNames}
            activeRuns={activeRuns}
            recentFinishedRuns={recentFinishedRuns}
            launchingName={launching}
            onSelect={handleSelect}
            onNew={handleNew}
            onRun={name => void handleLaunch(name)}
            onWatchRun={watchRun}
            onSelectRunWorkflow={handleSelect}
            onGoOverview={handleGoOverview}
            onBrowseMarketplace={handleBrowseMarketplace}
          />
        }
      >
        <ChatDock
          agentId={dockAgentId}
          storageKey="workflows"
          initialRatio={0.55}
          headerTitle={focusedRun ? `Running: ${focusedRun.displayName || focusedRun.workflowName}` : "Workflow Agent"}
          extraAttachments={extraAttachments}
          onRemoveExtraAttachment={id => setDismissedAttachments(prev => ({ ...prev, [id]: true }))}
        >
          {detailPane}
        </ChatDock>
      </WorkspaceShell>

      {deleteTarget && (
        <ConfirmModal
          title="Delete workflow"
          message={`Delete "${deleteTarget}"? Its YAML file will be removed from disk.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          closeOnBackdrop
        />
      )}
      {pendingAction && (
        <PendingDialog
          title="Discard unsaved changes?"
          message="You have unsaved edits to this workflow. Leave and lose them?"
          confirmLabel="Discard"
          onConfirm={action => action.run()}
        />
      )}
    </div>
  );
}

function runTitleFromRun(run: WorkflowRun): string {
  return run.displayName || run.workflowName;
}

function LoadingIndicator() {
  return (
    <div className="py-8 flex justify-center">
      <Loader2 className="w-5 h-5 text-muted animate-spin" />
    </div>
  );
}
