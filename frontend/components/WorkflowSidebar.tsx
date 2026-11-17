import SidebarCategoryAccordion from "@tokenring-ai/one-frontend/components/layout/SidebarCategoryAccordion.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@tokenring-ai/one-frontend/components/ui/dropdown-menu.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LaunchButton from "@tokenring-ai/one-frontend/components/ui/LaunchButton.tsx";
import ListItemWithActions from "@tokenring-ai/one-frontend/components/ui/ListItemWithActions.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import { Button } from "@tokenring-ai/one-frontend/ui";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { Copy, GitBranch, History, Loader2, MoreHorizontal, Plus, Store, Upload } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { DEFAULT_CATEGORY, matchesWorkflowFilter, workflowTitle } from "../lib/drafts.ts";
import { RunningCountBadge } from "./RunPanels.tsx";

/** 28px hit targets for the row's buttons. */
const ROW_BUTTON = "grid h-7 w-7 place-items-center rounded shrink-0 transition-colors cursor-pointer focus-ring";
/** The ⋯ menu shows on hover/focus, on touch, and while its menu is open; Run stays visible. */
const ROW_REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100";

/** A labelled icon button for the sidebar header (tooltip and accessible name are the same text). */
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer focus-ring shrink-0"
    >
      {children}
    </button>
  );
}

export function WorkflowSidebar({
  workflows,
  isLoading,
  loadError,
  onRetryLoad,
  selectedName,
  creating,
  dirtyNames,
  activeRuns,
  launchingName,
  onSelect,
  onNew,
  onRun,
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
  launchingName: string | null;
  onSelect: (name: string) => void;
  onNew: () => void;
  onRun: (name: string) => void;
  /** The Runs page (running and recent runs). */
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
      {/* No title: the panel's tab already says "Workflows". New / Import / Marketplace live here and nowhere else. */}
      <ViewHeader variant="navigator">
        <Button variant="secondary" icon={Plus} onClick={onNew} title="Create a new workflow">
          New
        </Button>
        <IconAction label="Import workflow from a YAML file" onClick={() => importInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" />
        </IconAction>
        <IconAction label="Find workflows in the Marketplace" onClick={onBrowseMarketplace}>
          <Store className="w-3.5 h-3.5" />
        </IconAction>
      </ViewHeader>

      <button
        type="button"
        onClick={onGoOverview}
        title={activeRuns.length > 0 ? `Runs: ${activeRuns.length} running` : "Running and recent runs"}
        className="shrink-0 flex items-center gap-2 px-3 h-8 border-b border-primary/50 text-xs text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer focus-ring"
      >
        <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Runs</span>
        {activeRuns.length > 0 && <RunningCountBadge count={activeRuns.length} />}
      </button>

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
                alwaysShowAction
                primaryProps={{ title: workflow.displayName }}
                className={`gap-0.5 pl-5 pr-1 py-0.5 rounded-none ${isSelected ? "bg-accent-muted text-accent" : "text-primary"}`}
                action={
                  <span className="flex items-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`More actions for ${workflowTitle(workflow)}`}
                          title="More actions"
                          className={`${ROW_BUTTON} text-muted hover:text-primary hover:bg-hover ${ROW_REVEAL}`}
                        >
                          {duplicatingName === workflow.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2 text-xs" disabled={duplicatingName !== null} onSelect={() => onDuplicate(workflow.name)}>
                          <Copy className="w-3.5 h-3.5 text-muted" aria-hidden="true" /> Duplicate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <LaunchButton
                      loading={isLaunching}
                      onClick={() => onRun(workflow.name)}
                      variant="icon"
                      iconSize="md"
                      title={`Run ${workflowTitle(workflow)}`}
                      aria-label={`Run ${workflowTitle(workflow)}`}
                      className={ROW_BUTTON}
                      bgClassName={isSelected ? "text-accent hover:bg-accent/15" : "text-muted hover:text-accent hover:bg-accent-muted"}
                    />
                  </span>
                }
              >
                <span className="flex items-center gap-1.5 py-0.5 min-w-0">
                  <GitBranch className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="flex-1 min-w-0 truncate text-xs">{workflow.displayName || workflow.name}</span>
                  {hasActiveRun && <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" title="Running" />}
                  {dirtyNames.has(workflow.name) && <span className="w-2 h-2 rounded-full bg-warning shrink-0" title="Unsaved changes" />}
                </span>
              </ListItemWithActions>
            );
          }}
        />
      </div>
    </div>
  );
}
