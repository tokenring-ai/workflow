import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import StatusBadge, { RUN_STATUS_BADGES } from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useDashboardApi } from "@tokenring-ai/one-frontend/dock/DashboardApiContext.tsx";
import { useWorkflowRuns } from "@tokenring-ai/one-frontend/rpc.ts";
import { GitBranch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WORKFLOWS_ROOT } from "../lib/paths.ts";
import { useWorkflowsNavigation } from "../lib/workflowsShared.tsx";

const MAX_ROWS = 50;

/** Recent workflow runs. Active runs open the agent's chat; finished ones open the run detail. */
export default function WorkflowRunsView() {
  const runs = useWorkflowRuns();
  const navigate = useNavigate();
  const dashboard = useDashboardApi();
  const { openRun } = useWorkflowsNavigation();

  if (runs.isLoading && !runs.data) return <LoadingState size="sm" className="h-full" />;
  if (runs.error && !runs.data) return <ErrorState error={runs.error} onRetry={() => void runs.mutate()} title="Unable to load workflow runs" variant="page" />;

  const list = [...(runs.data?.runs ?? [])].reverse().slice(0, MAX_ROWS);
  if (list.length === 0)
    return (
      <EmptyState
        icon={GitBranch}
        title="No workflow runs yet"
        hint="Launch a workflow to track it here."
        variant="page"
        ctaLabel="Open Workflows"
        onCta={() => void navigate(WORKFLOWS_ROOT)}
        ctaIcon={GitBranch}
      />
    );

  return (
    <ViewShell>
      <ul className="divide-y divide-primary/60" aria-label="Workflow runs">
        {list.map(run => {
          const active = run.status === "running" || run.status === "starting";
          const open = () => {
            if (active && run.agentId) dashboard.openView("chat", { agentId: run.agentId }, { position: "right" });
            // Opens the panel as well as routing, so it re-opens even when the URL already names the run.
            else openRun(run);
          };
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={open}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-hover focus-ring"
                aria-label={`Open workflow run ${run.displayName}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-primary truncate">{run.displayName}</span>
                  <span className="block text-xs text-muted truncate">
                    {run.agentType} · step {Math.min(run.currentStep + 1, run.steps.length)}/{run.steps.length}
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
