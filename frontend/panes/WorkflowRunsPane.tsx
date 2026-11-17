import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import StatusBadge, { RUN_STATUS_BADGES } from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { usePaneLink } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useWorkflowRuns } from "@tokenring-ai/one-frontend/rpc.ts";
import { GitBranch } from "lucide-react";
import { runTitle } from "../components/RunPanels.tsx";
import { WORKFLOWS_OVERVIEW_VIEW_ID } from "../ids.ts";
import { useAgentTypeLabel, useWorkflowLayoutNavigation } from "../lib/useWorkflowLayoutNavigation.ts";

const MAX_ROWS = 50;

/** Recent workflow runs. Active runs open the agent's chat; finished ones open the run detail. */
export default function WorkflowRunsPane() {
  const runs = useWorkflowRuns();
  const open = usePaneLink();
  const { openRun, openAgentChat } = useWorkflowLayoutNavigation();
  const agentLabel = useAgentTypeLabel();

  if (runs.isLoading && !runs.data) return <LoadingState size="sm" className="h-full" />;
  if (runs.error && !runs.data) return <ErrorState error={runs.error} onRetry={() => void runs.mutate()} title="Unable to load workflow runs" variant="page" />;

  const list = [...(runs.data?.runs ?? [])].reverse().slice(0, MAX_ROWS);
  if (list.length === 0)
    return (
      <EmptyState
        icon={GitBranch}
        title="No workflow runs yet"
        hint="Run a workflow to track it here."
        variant="page"
        ctaLabel="Open Workflows"
        onCta={() => open(WORKFLOWS_OVERVIEW_VIEW_ID)}
        ctaIcon={GitBranch}
      />
    );

  return (
    <ViewShell>
      <ul className="divide-y divide-primary/60" aria-label="Workflow runs">
        {list.map(run => {
          const active = run.status === "running" || run.status === "starting";
          const openIt = () => {
            if (active && run.agentId) openAgentChat(run.agentId);
            else openRun(run);
          };
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={openIt}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-hover focus-ring"
                aria-label={`Open workflow run ${runTitle(run)}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-primary truncate">{runTitle(run)}</span>
                  <span className="block text-xs text-muted truncate">
                    {agentLabel(run.agentType)} · step {Math.min(run.currentStep + 1, run.steps.length)}/{run.steps.length}
                  </span>
                </span>
                <StatusBadge status={run.status} statuses={RUN_STATUS_BADGES} variant="inline" />
              </button>
            </li>
          );
        })}
      </ul>
    </ViewShell>
  );
}
