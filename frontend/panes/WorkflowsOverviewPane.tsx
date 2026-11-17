import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LaunchButton from "@tokenring-ai/one-frontend/components/ui/LaunchButton.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useTypedSWR, useWorkflowRuns, useWorkflows, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button } from "@tokenring-ai/one-frontend/ui";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { GitBranch, History, Store } from "lucide-react";
import { useMemo } from "react";
import { isRunActive, isRunFinished, RunningCountBadge, RunningWorkflowCard, RunStatusBadge, runTitle, sortRunsNewestFirst } from "../components/RunPanels.tsx";
import WorkflowRollup from "../components/WorkflowRollup.tsx";
import { workflowTitle } from "../lib/drafts.ts";
import { useAgentTypeLabel, useWorkflowLaunch, useWorkflowLayoutNavigation } from "../lib/useWorkflowLayoutNavigation.ts";

function WorkflowsEmptyState({ directory, onNew, onBrowseMarketplace }: { directory: string | undefined; onNew: () => void; onBrowseMarketplace: () => void }) {
  return (
    <EmptyState
      variant="card"
      icon={GitBranch}
      title="No workflows yet"
      hint="A workflow is an ordered list of steps for an agent. Running one starts a new agent of the workflow's type and sends it each step in turn; you can follow the run step by step and chat with its agent. Write one yourself, or install a ready-made one from the marketplace."
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
function FinishedRunRow({ run, agentLabel, onOpen }: { run: WorkflowRun; agentLabel: string; onOpen: () => void }) {
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
            {agentLabel} · {formatRelativeTime(run.finishedAt ?? run.startedAt)}
          </span>
        </span>
        <RunStatusBadge status={run.status} />
      </button>
    </li>
  );
}

const RECENT_RUNS = 20;
const START_TILES = 4;

/** The workflows to offer for starting: most recently run first, then the rest of the library. */
function pickStartWorkflows(workflows: Workflow[], runs: WorkflowRun[], limit = START_TILES): { workflow: Workflow; lastRun: WorkflowRun | null }[] {
  const byName = new Map(workflows.map(workflow => [workflow.name, workflow]));
  const picked: { workflow: Workflow; lastRun: WorkflowRun | null }[] = [];
  const seen = new Set<string>();
  const byRecency = [...runs].sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  for (const run of byRecency) {
    const workflow = byName.get(run.workflowName);
    if (!workflow || seen.has(workflow.name)) continue;
    seen.add(workflow.name);
    picked.push({ workflow, lastRun: run });
  }
  // Fill the rest from the library (all of it, when there is no history to go on).
  for (const workflow of workflows) {
    if (!seen.has(workflow.name)) picked.push({ workflow, lastRun: null });
  }
  return picked.slice(0, limit);
}

/** One workflow you can start from here: its name opens the editor, Run starts it. */
function StartTile({
  workflow,
  lastRun,
  running,
  onOpen,
  onRun,
}: {
  workflow: Workflow;
  lastRun: WorkflowRun | null;
  running: boolean;
  onOpen: () => void;
  onRun: () => void;
}) {
  const title = workflowTitle(workflow);
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left cursor-pointer focus-ring rounded"
        title={`Open ${title}`}
        aria-label={`Open ${title}`}
      >
        <span className="block truncate text-sm font-medium text-fg">{title}</span>
        <span className="block truncate text-xs text-muted">
          {lastRun ? `Last run ${formatRelativeTime(lastRun.finishedAt ?? lastRun.startedAt)}` : workflow.category || "Never run"}
        </span>
      </button>
      <LaunchButton loading={running} onClick={onRun} label="Run" loadingLabel="Starting…" aria-label={`Run ${title}`} title={`Run ${title}`} />
    </li>
  );
}

/**
 * The Workflows app's landing page (`/workflows`): what is running and what
 * ran, with the workflows you ran last one click from starting again. The
 * full library is on the left; this page gives way to the first editor, run
 * or chat you open.
 */
export default function WorkflowsOverviewPane() {
  const workflows = useWorkflows();
  const workflowRuns = useWorkflowRuns();
  const workflowDirectory = useTypedSWR("/workflow/getWorkflowDirectory", () => workflowRPCClient.getWorkflowDirectory({}));
  const { openCreate, openMarketplace, openRun, openWorkflow } = useWorkflowLayoutNavigation();
  const { launch, launching } = useWorkflowLaunch();
  const agentLabel = useAgentTypeLabel();

  const workflowList = (workflows.data ?? []) as Workflow[];
  const allRuns = useMemo(() => sortRunsNewestFirst((workflowRuns.data?.runs ?? []) as WorkflowRun[]), [workflowRuns.data]);
  const activeRuns = useMemo(() => allRuns.filter(isRunActive), [allRuns]);
  const finishedRuns = useMemo(() => allRuns.filter(isRunFinished).slice(0, RECENT_RUNS), [allRuns]);
  const startWorkflows = useMemo(() => pickStartWorkflows(workflowList, allRuns), [workflowList, allRuns]);

  const noWorkflows = !workflows.isLoading && !workflows.error && workflowList.length === 0;

  return (
    // No header title: the tab and breadcrumb already say "Runs". New / Import / Marketplace live in the library.
    <ViewShell pad="page" width="prose">
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
      ) : (
        <div className="space-y-6">
          {/* Without this, a failed workflow list just made the section vanish with no explanation. */}
          {workflows.error && !workflows.data && (
            <ErrorState title="Unable to load workflows" error={workflows.error} onRetry={() => void workflows.mutate()} className="py-4" />
          )}
          {startWorkflows.length > 0 && (
            <section className="space-y-2" aria-label="Start a workflow">
              <h2 className="px-1 text-sm font-semibold text-fg">Start a workflow</h2>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {startWorkflows.map(({ workflow, lastRun }) => (
                  <StartTile
                    key={workflow.name}
                    workflow={workflow}
                    lastRun={lastRun}
                    running={launching === workflow.name}
                    onOpen={() => openWorkflow(workflow.name)}
                    onRun={() => void launch(workflow.name)}
                  />
                ))}
              </ul>
              <p className="px-1 text-xs text-muted">The rest are in the library on the left.</p>
            </section>
          )}
          {allRuns.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-3">
              <History className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
              <p className="text-xs text-muted">
                <span className="font-medium text-fg">No runs yet.</span> Run a workflow above and its progress will show here; its agent opens beside it.
              </p>
            </div>
          ) : (
            <>
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
              <WorkflowRollup onSelectWorkflow={openWorkflow} />
              {finishedRuns.length > 0 && (
                <section className="space-y-1" aria-label="Recent runs">
                  <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Recent runs</h2>
                  <ul>
                    {finishedRuns.map(run => (
                      <FinishedRunRow key={run.id} run={run} agentLabel={agentLabel(run.agentType)} onOpen={() => openRun(run)} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </ViewShell>
  );
}
