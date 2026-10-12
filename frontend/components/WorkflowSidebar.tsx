import NavigationSidebarHeader from "@tokenring-ai/one-frontend/components/layout/NavigationSidebarHeader.tsx";
import SidebarCategoryAccordion from "@tokenring-ai/one-frontend/components/layout/SidebarCategoryAccordion.tsx";
import BusySpinner from "@tokenring-ai/one-frontend/components/ui/BusySpinner.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LaunchButton from "@tokenring-ai/one-frontend/components/ui/LaunchButton.tsx";
import ListItemWithActions from "@tokenring-ai/one-frontend/components/ui/ListItemWithActions.tsx";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { CheckCircle2, Copy, GitBranch, History, LayoutDashboard, Loader2, Plus, Store, Upload, X, XCircle } from "lucide-react";
import { useRef } from "react";
import { DEFAULT_CATEGORY, matchesWorkflowFilter, workflowTitle } from "../lib/drafts.ts";
import { openRunLabel, RunningCountBadge, runStepSummary, runTitle } from "./RunPanels.tsx";

export function WorkflowSidebar({
  workflows,
  isLoading,
  loadError,
  onRetryLoad,
  selectedName,
  creating,
  dirtyNames,
  activeRuns,
  recentFinishedRuns,
  launchingName,
  onSelect,
  onNew,
  onRun,
  onWatchRun,
  onSelectRunWorkflow,
  onGoOverview,
  onBrowseMarketplace,
  onImportFile,
  onDuplicate,
  duplicatingName,
}: {
  workflows: Workflow[];
  isLoading: boolean;
  loadError: unknown;
  onRetryLoad: () => void;
  selectedName: string | null;
  creating: boolean;
  dirtyNames: Set<string>;
  activeRuns: WorkflowRun[];
  recentFinishedRuns: WorkflowRun[];
  launchingName: string | null;
  onSelect: (name: string) => void;
  onNew: () => void;
  onRun: (name: string) => void;
  /** Focus a running run inside the app (dock + editor). */
  onWatchRun: (run: WorkflowRun) => void;

  onSelectRunWorkflow: (workflowName: string) => void;
  onGoOverview: () => void;
  onBrowseMarketplace: () => void;
  /** A workflow YAML file the user picked to import. */
  onImportFile: (file: File) => void;
  onDuplicate: (name: string) => void;
  duplicatingName: string | null;
}) {
  const importInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="h-full flex flex-col bg-secondary border-r border-primary">
      <NavigationSidebarHeader
        title="Workflows"
        actions={[
          {
            key: "overview",
            icon: <LayoutDashboard className="w-3.5 h-3.5" />,
            label: "Workflows overview",
            title: "Workflows overview",
            onClick: onGoOverview,
          },
          {
            key: "marketplace",
            icon: <Store className="w-3.5 h-3.5" />,
            label: "Browse the workflow marketplace",
            title: "Browse the workflow marketplace",
            onClick: onBrowseMarketplace,
          },
          {
            key: "import",
            icon: <Upload className="w-3.5 h-3.5" />,
            label: "Import workflow from YAML",
            title: "Import workflow from YAML",
            onClick: () => importInputRef.current?.click(),
          },
          {
            key: "new",
            icon: <Plus className="w-3.5 h-3.5" />,
            label: "New workflow",
            title: "New workflow",
            onClick: onNew,
          },
        ]}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".yaml,.yml,application/yaml,text/yaml"
        className="hidden"
        aria-label="Workflow YAML file to import"
        data-testid="workflow-import-input"
        onChange={event => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again still fires a change.
          event.target.value = "";
          if (file) onImportFile(file);
        }}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-primary/50">
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-500/90 uppercase tracking-widest">Running</span>
            <RunningCountBadge count={activeRuns.length} live />
          </div>
          {activeRuns.length === 0 ? (
            <div className="px-3 py-4 text-center text-muted text-xs italic">No active workflows</div>
          ) : (
            activeRuns.map(run => (
              <button
                type="button"
                key={run.id}
                onClick={() => (run.agentId ? onWatchRun(run) : onSelectRunWorkflow(run.workflowName))}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-hover transition-colors cursor-pointer focus-ring"
                aria-label={openRunLabel(run)}
                title={runStepSummary(run)}
              >
                <BusySpinner />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-primary truncate">{runTitle(run)}</div>
                  <div className="text-xs text-muted truncate">{runStepSummary(run)}</div>
                </div>
              </button>
            ))
          )}
        </div>

        {recentFinishedRuns.length > 0 && (
          <div className="border-b border-primary/50">
            <span className="flex items-center gap-1 px-3 pt-2.5 pb-1 text-xs font-bold text-muted uppercase tracking-widest">
              <History className="w-3 h-3" /> Recent runs
            </span>
            {recentFinishedRuns.map(run => {
              const when = run.finishedAt ?? run.startedAt;
              return (
                <button
                  type="button"
                  key={run.id}
                  onClick={() => onSelectRunWorkflow(run.workflowName)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-hover transition-colors cursor-pointer focus-ring"
                  aria-label={`View runs for ${run.displayName || run.workflowName}`}
                  title={run.message || undefined}
                >
                  <div className="mt-0.5 shrink-0">
                    {run.status === "completed" ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    ) : run.status === "failed" ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <X className="w-3 h-3 text-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-primary truncate">{run.displayName || run.workflowName}</div>
                    <div className="text-xs text-muted truncate">
                      {run.status} · {formatRelativeTime(when)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {creating && (
          <div className="flex items-center gap-1.5 px-2 py-2 bg-accent-muted text-accent border-b border-primary/50">
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 min-w-0 truncate text-xs font-medium">New workflow</span>
          </div>
        )}

        <SidebarCategoryAccordion
          className="py-2"
          items={workflows}
          getCategory={workflow => workflow.category || DEFAULT_CATEGORY}
          getItemKey={workflow => workflow.name}
          defaultCategory={DEFAULT_CATEGORY}
          isLoading={isLoading}
          error={loadError}
          search={{
            placeholder: "Filter workflows…",
            ariaLabel: "Filter workflows",
            clearAriaLabel: "Clear workflow filter",
            match: matchesWorkflowFilter,
          }}
          loadingState={
            <div className="px-3 py-6 flex justify-center">
              <Loader2 className="w-4 h-4 text-muted animate-spin" />
            </div>
          }
          errorState={<ErrorState title="Unable to load workflows" error={loadError} onRetry={onRetryLoad} />}
          emptyState={
            <div className="px-3 py-6 text-center">
              <GitBranch className="w-6 h-6 text-muted mx-auto mb-2 opacity-60" />
              <p className="text-xs text-muted">No workflows yet</p>
            </div>
          }
          noMatchState={query => <div className="px-3 py-4 text-center text-muted text-xs italic">No workflows match “{query}”</div>}
          renderItem={workflow => {
            const isSelected = selectedName === workflow.name && !creating;
            const isLaunching = launchingName === workflow.name;
            const hasActiveRun = activeRuns.some(run => run.workflowName === workflow.name);
            return (
              <ListItemWithActions
                id={workflow.name}
                selected={isSelected}
                onPrimary={() => onSelect(workflow.name)}
                alwaysShowAction={isSelected}
                primaryProps={{ title: workflow.displayName }}
                className={`gap-0.5 pl-5 pr-1.5 py-1 rounded-none ${isSelected ? "bg-accent-muted text-accent" : "text-primary"}`}
                action={
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onDuplicate(workflow.name)}
                      disabled={duplicatingName !== null}
                      title={`Duplicate ${workflowTitle(workflow)}`}
                      aria-label={`Duplicate ${workflowTitle(workflow)}`}
                      className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {duplicatingName === workflow.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <LaunchButton
                      loading={isLaunching}
                      onClick={() => onRun(workflow.name)}
                      variant="icon"
                      iconSize="sm"
                      title={`Run ${workflowTitle(workflow)}`}
                      aria-label={`Run ${workflowTitle(workflow)}`}
                      bgClassName={
                        isSelected ? "text-accent hover:bg-accent/15" : "text-muted hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10"
                      }
                    />
                  </span>
                }
              >
                <span className="flex items-center gap-1.5 py-0.5 min-w-0">
                  <GitBranch className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="flex-1 min-w-0 truncate text-xs">{workflow.displayName || workflow.name}</span>
                  {hasActiveRun && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" title="Running" />}
                  {dirtyNames.has(workflow.name) && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Unsaved changes" />}
                </span>
              </ListItemWithActions>
            );
          }}
        />
      </div>
    </div>
  );
}
