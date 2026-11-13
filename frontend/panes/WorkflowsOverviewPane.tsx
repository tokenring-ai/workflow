import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useTypedSWR, useWorkflowRuns, useWorkflows, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button } from "@tokenring-ai/one-frontend/ui";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { GitBranch, History, Plus, Store } from "lucide-react";
import { useMemo } from "react";
import { isRunActive, isRunFinished, RunningCountBadge, RunningWorkflowCard, RunStatusBadge, runTitle, sortRunsNewestFirst } from "../components/RunPanels.tsx";
import { useWorkflowLayoutNavigation } from "../lib/useWorkflowLayoutNavigation.ts";

function WorkflowsEmptyState({ directory, onNew, onBrowseMarketplace }: { directory: string | undefined; onNew: () => void; onBrowseMarketplace: () => void }) {
  return (
    <EmptyState
      variant="card"
      icon={GitBranch}
      title="No workflows yet"
      hint="A workflow is an ordered list of steps for an agent. Launching one starts a new agent of the workflow's type and sends it each step in turn; you can follow the run step by step and chat with its agent. Write one yourself, or install a ready-made one from the marketplace."
      ctaLabel="New workflow"
      onCta={onNew}
      action={
        <Button variant="secondary" icon={Store} onClick={onBrowseMarketplace}>
          Browse the marketplace
        </Button>
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

/** One finished run: what ran, how it ended, when. */
function FinishedRunRow({ run, onOpen }: { run: WorkflowRun; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover focus-ring"
        aria-label={`Open run of ${runTitle(run)}`}
        title={run.message || undefined}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-primary">{runTitle(run)}</span>
          <span className="block truncate text-xs text-muted">
            {run.agentType} · {formatRelativeTime(run.finishedAt ?? run.startedAt)}
          </span>
        </span>
        <RunStatusBadge status={run.status} />
      </button>
    </li>
  );
}

const RECENT_RUNS = 20;

/**
 * The Workflows app's landing page (`/workflows`): what is running and what
 * ran. Workflows themselves are in the library on the left (run one with its
 * ▶); this page gives way to the first editor, run or chat you open.
 */
export default function WorkflowsOverviewPane() {
  const workflows = useWorkflows();
  const workflowRuns = useWorkflowRuns();
  const workflowDirectory = useTypedSWR("/workflow/getWorkflowDirectory", () => workflowRPCClient.getWorkflowDirectory({}));
  const { openCreate, openMarketplace, openRun } = useWorkflowLayoutNavigation();

  const workflowList = (workflows.data ?? []) as Workflow[];
  const allRuns = useMemo(() => sortRunsNewestFirst((workflowRuns.data?.runs ?? []) as WorkflowRun[]), [workflowRuns.data]);
  const activeRuns = useMemo(() => allRuns.filter(isRunActive), [allRuns]);
  const finishedRuns = useMemo(() => allRuns.filter(isRunFinished).slice(0, RECENT_RUNS), [allRuns]);

  const noWorkflows = !workflows.isLoading && !workflows.error && workflowList.length === 0;

  return (
    <ViewShell
      pad="page"
      width="prose"
      header={
        <ViewHeader title="Runs">
          <Button variant="ghost" icon={Store} onClick={openMarketplace}>
            Browse marketplace
          </Button>
          <Button variant="secondary" icon={Plus} onClick={openCreate}>
            New workflow
          </Button>
        </ViewHeader>
      }
    >
      {noWorkflows ? (
        <WorkflowsEmptyState directory={workflowDirectory.data?.directory} onNew={openCreate} onBrowseMarketplace={openMarketplace} />
      ) : workflowRuns.isLoading && !workflowRuns.data ? (
        <LoadingState className="py-10" />
      ) : workflowRuns.error && !workflowRuns.data ? (
        <ErrorState
          title="Unable to load workflow runs"
          error={workflowRuns.error}
          onRetry={() => void workflowRuns.mutate()}
          variant="page"
          className="py-8"
        />
      ) : allRuns.length === 0 ? (
        <EmptyState
          variant="card"
          icon={History}
          title="No runs yet"
          hint="Pick a workflow in the library on the left and press ▶ to run it. Its progress shows here, and its agent's chat opens beside it."
        />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2" aria-label="Running">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Running</h2>
              {activeRuns.length > 0 && <RunningCountBadge count={activeRuns.length} />}
            </div>
            {activeRuns.length === 0 ? (
              <p className="px-1 text-xs text-muted">Nothing is running.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {activeRuns.map(run => (
                  <RunningWorkflowCard key={run.id} run={run} onOpen={() => openRun(run)} />
                ))}
              </div>
            )}
          </section>
          {finishedRuns.length > 0 && (
            <section className="space-y-1" aria-label="Recent runs">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Recent runs</h2>
              <ul>
                {finishedRuns.map(run => (
                  <FinishedRunRow key={run.id} run={run} onOpen={() => openRun(run)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </ViewShell>
  );
}
