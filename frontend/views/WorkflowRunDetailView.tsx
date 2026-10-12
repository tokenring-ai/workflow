import type { ExtraChatAttachment } from "@tokenring-ai/one-frontend/components/chat/ChatFooter.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { setChatExtras } from "@tokenring-ai/one-frontend/dock/chatExtras.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { formatStepLabel, type WorkflowStep } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import { useWorkflowRuns, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { WorkflowRun } from "@tokenring-ai/workflow/schema";
import { Activity, GitBranch, MessageSquare, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkflowRunDetailParams } from "../app.tsx";
import { ActiveRunPanel, isRunActive, RunStatusBadge, runTitle } from "../components/RunPanels.tsx";
import { useWorkflowLaunch, useWorkflowsNavigation } from "../lib/workflowsShared.tsx";

/** Live step checklist for one workflow run, with its agent's chat a click away. */
export default function WorkflowRunDetailView({ params, panel }: ViewProps<WorkflowRunDetailParams>) {
  const runId = params.runId;
  const workflowRuns = useWorkflowRuns();
  const { openWorkflow, openAgentChat } = useWorkflowsNavigation();
  const [cancelling, setCancelling] = useState(false);
  const { launch, launching } = useWorkflowLaunch();
  /** The user removed the auto-attached workflow chip from the chat this session. */
  const [attachmentDismissed, setAttachmentDismissed] = useState(false);

  const run = useMemo(() => ((workflowRuns.data?.runs ?? []) as WorkflowRun[]).find(candidate => candidate.id === runId), [runId, workflowRuns.data]);
  const active = run ? isRunActive(run) : false;

  useEffect(() => {
    panel.setTitle(run ? runTitle(run) : `Run ${runId}`);
  }, [panel, run, runId]);

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

  const agentId = run?.agentId ?? null;
  useEffect(() => {
    if (!agentId) return;
    setChatExtras(agentId, extraAttachments.length > 0 ? { attachments: extraAttachments, onRemove: () => setAttachmentDismissed(true) } : null);
    return () => setChatExtras(agentId, null);
  }, [agentId, extraAttachments]);

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
                <span className="truncate">{run.workflowName}</span>
              </button>
              <span className="text-xs text-muted">started {formatRelativeTime(run.startedAt)}</span>
              <span className="flex-1" />
              {run.agentId && (
                <button
                  type="button"
                  onClick={() => openAgentChat(run.agentId!)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border border-primary text-secondary hover:text-primary hover:bg-hover focus-ring cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Chat
                </button>
              )}
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
          // Runs record no launch inputs beyond the workflow itself, so a re-run is a fresh launch of it.
          onRerun={finished => void launch(finished.workflowName)}
          rerunning={launching === run.workflowName}
        />
      </div>
    </ViewShell>
  );
}
