import { useAttachedAgentChat } from "@tokenring-ai/one-frontend/apps/chat/useAttachedAgentChat.ts";
import { usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import type { ExtraChatAttachment } from "@tokenring-ai/one-frontend/components/chat/ChatFooter.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { formatStepLabel, type WorkflowStep } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useWorkflowRuns, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { WorkflowRun } from "@tokenring-ai/workflow/schema";
import { Activity, GitBranch, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActiveRunPanel, isRunActive, RunStatusBadge, runTitle } from "../components/RunPanels.tsx";
import { useWorkflowLayoutNavigation } from "../lib/useWorkflowLayoutNavigation.ts";

/** Live step checklist for one workflow run, with its agent's chat a click away. */
export default function WorkflowRunDetailPane({ params }: ViewProps) {
  const runId = params.runId ?? "";
  const panel = usePanel();
  const workflowRuns = useWorkflowRuns();
  const { openWorkflow, openAgentChat, openRun } = useWorkflowLayoutNavigation();
  const [cancelling, setCancelling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  /** The user removed the auto-attached workflow chip from the chat this session. */
  const [attachmentDismissed, setAttachmentDismissed] = useState(false);

  const run = useMemo(() => ((workflowRuns.data?.runs ?? []) as WorkflowRun[]).find(candidate => candidate.id === runId), [runId, workflowRuns.data]);
  const active = run ? isRunActive(run) : false;

  usePanelTitle(run ? runTitle(run) : `Run ${runId}`);

  // While the run is live, attach its workflow definition to the next chat message so the
  // agent (and the user) share the same picture of the steps. Removable like any chip.
  const extraAttachments: ExtraChatAttachment[] = useMemo(() => {
    if (!run || !active || attachmentDismissed) return [];
    const steps: WorkflowStep[] = run.steps;
    const body = [
      `# Workflow: ${run.displayName || run.workflowName}`,
      run.steps.length > 0 ? `Steps (${steps.length}):` : "(no steps)",
      ...steps.map((step, index) => `${index + 1}. ${formatStepLabel(step)}`),
    ].join("\n");
    return [
      {
        id: `workflow:${run.workflowName}`,
        label: `${run.workflowName}.yaml`,
        attachment: {
          name: `${run.workflowName}.yaml`,
          description: "The workflow this agent is currently running.",
          encoding: "text",
          mimeType: "text/markdown",
          body,
        },
      },
    ];
  }, [active, attachmentDismissed, run]);

  const onRemoveExtraAttachment = useCallback(() => setAttachmentDismissed(true), []);
  useAttachedAgentChat({ agentId: run?.agentId ?? null, extraAttachments, onRemoveExtraAttachment, beside: "right" });

  const handleCancel = useCallback(async () => {
    if (!run) return;
    setCancelling(true);
    try {
      const { success } = await workflowRPCClient.cancelRun({ runId: run.id });
      if (!success) toastManager.warning("That run already finished.", { duration: 3000 });
      else toastManager.success(`Cancelled "${runTitle(run)}"`, { duration: 3000 });
    } catch (error) {
      toastManager.error(formatError(error), { duration: 5000 });
    } finally {
      setCancelling(false);
    }
  }, [run]);

  const handleRerun = useCallback(
    async (finished: WorkflowRun) => {
      setRerunning(true);
      try {
        const started = await workflowRPCClient.rerunRun({ runId: finished.id });
        toastManager.success(`Started "${runTitle(finished)}" again`, { duration: 3000 });
        openRun({ id: started.runId, agentId: started.id });
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
      } finally {
        setRerunning(false);
      }
    },
    [openRun],
  );

  if (!run) {
    if (workflowRuns.isLoading && !workflowRuns.data) return <LoadingState message="Loading run…" className="h-full" />;
    return (
      <EmptyState
        variant="page"
        className="h-full"
        icon={Activity}
        title="Run not found"
        hint="This run is no longer tracked by the server. Close this panel."
        ctaLabel="Close panel"
        ctaIcon={X}
        onCta={() => panel.close()}
      />
    );
  }

  return (
    <ViewShell
      scroll={false}
      header={
        <ViewHeader
          variant="navigator"
          title={
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <RunStatusBadge status={run.status} />
              <button
                type="button"
                onClick={() => openWorkflow(run.workflowName)}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline focus-ring rounded min-w-0"
                title="Open the workflow definition"
              >
                <GitBranch className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{run.displayName || run.workflowName}</span>
              </button>
              <span className="text-xs text-muted">started {formatRelativeTime(run.startedAt)}</span>
            </div>
          }
        />
      }
    >
      <div className="flex-1 overflow-y-auto p-3">
        <ActiveRunPanel
          run={run}
          onOpenAgent={openAgentChat}
          onCancel={() => void handleCancel()}
          cancelling={cancelling}
          // A new run of the workflow as it is now, linked to this one (rerunOf). Interrupted runs are only ever re-run from here.
          onRerun={finished => void handleRerun(finished)}
          rerunning={rerunning}
        />
      </div>
    </ViewShell>
  );
}
