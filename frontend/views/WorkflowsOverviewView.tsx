import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { usePanel } from "@tokenring-ai/one-frontend/dock/PanelContext.tsx";
import { useMarketplaceItems, useTypedSWR, useWorkflowRuns, useWorkflows, workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { GitBranch, Plus, Store } from "lucide-react";
import { useMemo } from "react";
import { isRunActive, RunningCountBadge, RunningWorkflowCard, sortRunsNewestFirst, WorkflowCard } from "../components/RunPanels.tsx";
import { useWorkflowLaunch, useWorkflowsNavigation, WorkflowTabs } from "../lib/workflowsShared.tsx";

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

/** Running workflows and everything that can be launched; the Workflows dashboard's landing panel. */
export default function WorkflowsOverviewView() {
  const panel = usePanel();
  const workflows = useWorkflows();
  const workflowRuns = useWorkflowRuns();
  const workflowDirectory = useTypedSWR("/workflow/getWorkflowDirectory", () => workflowRPCClient.getWorkflowDirectory({}));
  const marketplace = useMarketplaceItems(panel.isVisible);
  const marketplaceCount = marketplace.data?.status === "success" ? marketplace.data.items.filter(item => item.kind === "workflow").length : undefined;
  const { launch, launching } = useWorkflowLaunch();
  const { openWorkflow, openCreate, openMarketplace, openRun } = useWorkflowsNavigation();

  const workflowList = (workflows.data ?? []) as Workflow[];
  const activeRuns = useMemo(() => sortRunsNewestFirst((workflowRuns.data?.runs ?? []) as WorkflowRun[]).filter(isRunActive), [workflowRuns.data]);
  const runningByWorkflow = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of activeRuns) counts.set(run.workflowName, (counts.get(run.workflowName) ?? 0) + 1);
    return counts;
  }, [activeRuns]);
  const hasWorkflows = workflowList.length > 0;

  return (
    <ViewShell
      scroll={false}
      header={
        <ViewHeader
          variant="navigator"
          title={
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <WorkflowTabs
                active="installed"
                installedCount={workflowList.length}
                marketplaceCount={marketplaceCount}
                onChange={tab => {
                  if (tab === "marketplace") openMarketplace();
                }}
              />
              <span className="flex-1" />
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-1.5 px-2.5 py-1.5 btn-accent text-xs font-semibold rounded-lg transition-colors cursor-pointer focus-ring"
              >
                <Plus className="w-3.5 h-3.5" /> New workflow
              </button>
            </div>
          }
        />
      }
    >
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
                  <RunningWorkflowCard key={run.id} run={run} onOpen={() => openRun(run)} />
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
              <LoadingState size="md" className="py-8" />
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
                    onView={() => openWorkflow(workflow.name)}
                    onLaunch={() => void launch(workflow.name)}
                  />
                ))}
              </div>
            ) : (
              <WorkflowsEmptyState directory={workflowDirectory.data?.directory} onNew={openCreate} onBrowseMarketplace={openMarketplace} />
            )}
          </section>
        </div>
      </div>
    </ViewShell>
  );
}
