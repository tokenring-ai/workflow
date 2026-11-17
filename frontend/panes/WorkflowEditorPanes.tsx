import { usePanelBadge, usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import ConfirmModal from "@tokenring-ai/one-frontend/components/ui/ConfirmModal.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useEntityDelete } from "@tokenring-ai/one-frontend/hooks/useEntityDelete.ts";
import { useRemoteChangeDetection } from "@tokenring-ai/one-frontend/hooks/useRemoteChangeDetection.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { toastOnReject } from "@tokenring-ai/one-frontend/lib/toastOnReject.ts";
import { runOrConfirm } from "@tokenring-ai/one-frontend/lib/uiPreferences.ts";
import { useAgentTypes, useAvailableCommands, useWorkflowRuns, useWorkflows, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { GitBranch, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isRunActive, sortRunsNewestFirst } from "../components/RunPanels.tsx";
import WorkflowEditor from "../components/WorkflowEditor.tsx";
import { cloneDraft, emptyDraft, isSameDraft, isValidWorkflowName, normalizeDraft, toDraft, uniqueCloneName, workflowTitle } from "../lib/drafts.ts";
import { useWorkflowLaunch, useWorkflowLayoutNavigation } from "../lib/useWorkflowLayoutNavigation.ts";
import { NEW_DRAFT_KEY, setNewWorkflowName, useNewWorkflowName, useWorkflowDrafts } from "../lib/workflowState.tsx";
import { downloadWorkflowYaml } from "../lib/workflowTransfer.ts";

function useEditorData() {
  const workflows = useWorkflows();
  const agentTypes = useAgentTypes();
  const availableCommands = useAvailableCommands();
  const workflowRuns = useWorkflowRuns();
  const workflowList = (workflows.data ?? []) as Workflow[];
  const commandList = useMemo(() => availableCommands.data ?? [], [availableCommands.data]);
  const categories = useMemo(() => [...new Set(workflowList.map(w => w.category).filter(Boolean))].sort(), [workflowList]);
  const allRuns = useMemo(() => sortRunsNewestFirst((workflowRuns.data?.runs ?? []) as WorkflowRun[]), [workflowRuns.data]);
  return { workflows, workflowList, agentTypes, commandList, categories, allRuns };
}

function refreshWorkflowsBestEffort(workflows: ReturnType<typeof useWorkflows>) {
  // List refresh is best-effort; a failed revalidate must not undo a successful save/delete.
  toastOnReject(Promise.resolve(workflows.mutate()), {
    message: err => `Failed to refresh workflow list: ${formatError(err)}`,
    duration: 4000,
  });
}

/** View or edit one installed workflow, with its live run and run history. */
export function WorkflowEditorPane({ params }: ViewProps) {
  const name = params.name ?? "";
  const panel = usePanel();
  const { workflows, workflowList, agentTypes, commandList, categories, allRuns } = useEditorData();
  const { drafts, setDraft, clearDraft, clearDraftIfUnchanged } = useWorkflowDrafts();
  const { launch, launching } = useWorkflowLaunch();
  const { openOverview, openCreate, openAgentChat, openRun } = useWorkflowLayoutNavigation();
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

  const selected = useMemo(() => workflowList.find(w => w.name === name) ?? null, [name, workflowList]);
  const savedDraft = useMemo(() => (selected ? toDraft(selected) : null), [selected]);
  const draft = drafts[name] ?? savedDraft;
  const isDirty = draft !== null && savedDraft !== null && !isSameDraft(draft, savedDraft);
  const workflowRuns = useMemo(() => allRuns.filter(run => run.workflowName === name), [allRuns, name]);
  const activeRun = useMemo(() => workflowRuns.find(isRunActive) ?? null, [workflowRuns]);

  usePanelTitle(selected ? workflowTitle(selected) : name);

  // Unsaved edits show on the tab; saving or discarding clears the badge, as does closing the panel.
  usePanelBadge(isDirty ? { tone: "warning", label: "Unsaved changes" } : null);

  // When an agent (or CLI) edits the open workflow on disk, reload it if the user has no unsaved
  // edits; with unsaved edits the poller stays quiet so nothing is clobbered.
  const { markLoaded } = useRemoteChangeDetection({
    documentKey: selected ? name : null,
    isDocumentReady: selected !== null,
    isDirty,
    strategy: {
      type: "polling",
      poll: async () => {
        const { workflow } = await workflowRPCClient.getWorkflow({ name });
        return workflow ? { updatedAt: workflow.updatedAt } : null;
      },
    },
    onRemoteChange: () => {
      refreshWorkflowsBestEffort(workflows);
      clearDraft(name);
      toastManager.warning("Workflow was updated on disk — reloaded the latest version.", { duration: 4000 });
    },
  });
  useEffect(() => {
    markLoaded(selected?.updatedAt ?? null);
  }, [markLoaded, selected?.updatedAt]);

  const entityDelete = useEntityDelete({
    currentRouteId: name,
    navigateToOverview: () => {
      openOverview();
      panel.close();
    },
    refreshList: () => refreshWorkflowsBestEffort(workflows),
    clearLocalState: clearDraft,
    successMessage: deleted => `Workflow "${deleted}" deleted`,
  });

  const handleSave = useCallback(async () => {
    if (!draft || !selected) return;
    setSaving(true);
    try {
      const { workflow: saved } = await workflowRPCClient.updateWorkflow({ name, workflow: normalizeDraft(draft) });
      // Our own write: record its timestamp now, or the disk poller could see it before the list
      // refresh does and report "updated on disk" for the user's own save.
      markLoaded(saved.updatedAt);
      // Edits typed while the save was in flight stay as the new draft.
      clearDraftIfUnchanged(name, draft);
      toastManager.success(`Workflow "${name}" saved`, { duration: 3000 });
      refreshWorkflowsBestEffort(workflows);
    } catch (error) {
      toastManager.error(formatError(error), { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }, [clearDraftIfUnchanged, draft, markLoaded, name, selected, workflows]);

  const handleDelete = useCallback(async () => {
    setDeleteTarget(null);
    await entityDelete.deleteEntity(name, name, async () => {
      const { success } = await workflowRPCClient.deleteWorkflow({ name });
      if (!success) throw new Error(`Workflow "${name}" could not be deleted`);
    });
  }, [entityDelete, name]);

  /** Opens the create form pre-filled from this workflow (including unsaved edits). */
  const handleClone = useCallback(() => {
    if (!draft) return;
    const cloned = cloneDraft(draft);
    const baseDisplay = cloned.displayName.trim();
    cloned.displayName = baseDisplay ? `${baseDisplay} (copy)` : "";
    setDraft(NEW_DRAFT_KEY, cloned);
    setNewWorkflowName(
      uniqueCloneName(
        name,
        workflowList.map(workflow => workflow.name),
      ),
    );
    openCreate();
  }, [draft, name, openCreate, setDraft, workflowList]);

  const handleCancelRun = useCallback(async (run: WorkflowRun) => {
    setCancellingRunId(run.id);
    try {
      const { success } = await workflowRPCClient.cancelRun({ runId: run.id });
      if (!success) toastManager.warning("That run already finished.", { duration: 3000 });
      else toastManager.success(`Cancelled "${run.displayName || run.workflowName}"`, { duration: 3000 });
    } catch (error) {
      toastManager.error(formatError(error), { duration: 5000 });
    } finally {
      setCancellingRunId(null);
    }
  }, []);

  if (!selected || !draft) {
    if (workflows.isLoading) return <LoadingState message="Loading workflow…" className="h-full" />;
    if (workflows.error) return <ErrorState title="Unable to load workflows" error={workflows.error} onRetry={() => void workflows.mutate()} variant="page" />;
    return (
      <EmptyState
        variant="page"
        className="h-full"
        icon={GitBranch}
        title="Workflow not found"
        hint={`"${name}" is not installed (it may have been deleted). Close this panel or pick another workflow.`}
        ctaLabel="Close panel"
        ctaIcon={X}
        onCta={() => panel.close()}
      />
    );
  }

  return (
    <ViewShell scroll={false}>
      <WorkflowEditor
        workflowName={name}
        creating={false}
        nameValue=""
        onNameChange={() => {}}
        draft={draft}
        onDraftChange={next => setDraft(name, next)}
        savedWorkflow={selected}
        isDirty={isDirty}
        activeRun={activeRun}
        workflowRuns={workflowRuns}
        categories={categories}
        agentTypes={agentTypes.data ?? []}
        commands={commandList}
        saving={saving}
        launching={launching === name}
        onSave={() => void handleSave()}
        onRevert={() => clearDraft(name)}
        onDelete={() =>
          runOrConfirm(
            "Delete workflow",
            () => setDeleteTarget(name),
            () => void handleDelete(),
          )
        }
        onClone={handleClone}
        onDownload={() => void downloadWorkflowYaml(name)}
        onLaunch={() => void launch(name)}
        onCancelCreate={() => {}}
        onOpenAgent={openAgentChat}
        onOpenRun={openRun}
        onCancelRun={run => void handleCancelRun(run)}
        cancellingRunId={cancellingRunId}
      />
      {deleteTarget && (
        <ConfirmModal
          title="Delete workflow"
          message={`Delete "${deleteTarget}"? Its YAML file will be removed from disk.`}
          onConfirm={() => handleDelete()}
          onClose={() => setDeleteTarget(null)}
          closeOnBackdrop
        />
      )}
    </ViewShell>
  );
}

/** Create a workflow. Cloning another workflow seeds this form. */
export function WorkflowCreatePane() {
  const panel = usePanel();
  const { workflows, workflowList, agentTypes, commandList, categories } = useEditorData();
  const { drafts, setDraft, clearDraft } = useWorkflowDrafts();
  const { openOverview, openWorkflow } = useWorkflowLayoutNavigation();
  const newName = useNewWorkflowName();
  const [saving, setSaving] = useState(false);
  const blank = useMemo(() => emptyDraft(), []);
  const draft = drafts[NEW_DRAFT_KEY] ?? blank;
  const isDirty = !isSameDraft(draft, blank);

  const finish = useCallback(() => {
    clearDraft(NEW_DRAFT_KEY);
    setNewWorkflowName("");
  }, [clearDraft]);

  const handleSave = useCallback(async () => {
    const name = newName.trim();
    if (!isValidWorkflowName(name)) return;
    if (workflowList.some(workflow => workflow.name === name)) {
      toastManager.error(`A workflow named "${name}" already exists`, { duration: 4000 });
      return;
    }
    setSaving(true);
    try {
      await workflowRPCClient.createWorkflow({ name, workflow: normalizeDraft(draft) });
      finish();
      toastManager.success(`Workflow "${name}" saved`, { duration: 3000 });
      refreshWorkflowsBestEffort(workflows);
      openWorkflow(name);
      panel.close();
    } catch (error) {
      toastManager.error(formatError(error), { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }, [draft, finish, newName, openWorkflow, panel, workflowList, workflows]);

  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const discardAndClose = useCallback(() => {
    setConfirmingDiscard(false);
    finish();
    openOverview();
    panel.close();
  }, [finish, openOverview, panel]);

  // A filled-in form is not thrown away on a stray click.
  const handleCancel = useCallback(() => {
    if (!isDirty && newName.trim() === "") discardAndClose();
    else runOrConfirm("Discard new workflow?", () => setConfirmingDiscard(true), discardAndClose);
  }, [discardAndClose, isDirty, newName]);

  return (
    <ViewShell scroll={false}>
      <WorkflowEditor
        workflowName={null}
        creating
        nameValue={newName}
        onNameChange={setNewWorkflowName}
        draft={draft}
        onDraftChange={next => setDraft(NEW_DRAFT_KEY, next)}
        savedWorkflow={null}
        isDirty={isDirty}
        activeRun={null}
        workflowRuns={[]}
        categories={categories}
        agentTypes={agentTypes.data ?? []}
        commands={commandList}
        saving={saving}
        launching={false}
        onSave={() => void handleSave()}
        onRevert={() => clearDraft(NEW_DRAFT_KEY)}
        onDelete={() => {}}
        onClone={() => {}}
        onDownload={() => {}}
        onLaunch={() => {}}
        onCancelCreate={handleCancel}
        onOpenAgent={() => {}}
        onOpenRun={() => {}}
        onCancelRun={() => {}}
        cancellingRunId={null}
      />
      {confirmingDiscard && (
        <ConfirmModal
          title="Discard new workflow?"
          message="The name, settings and steps you entered will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={discardAndClose}
          onClose={() => setConfirmingDiscard(false)}
          closeOnBackdrop
        />
      )}
    </ViewShell>
  );
}
