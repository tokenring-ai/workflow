import { useWorkflowRuns, useWorkflows } from "@tokenring-ai/one-frontend/rpc.ts";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import ImportWorkflowDialog from "../components/ImportWorkflowDialog.tsx";
import { isRunActive, isRunFinished, sortRunsNewestFirst } from "../components/RunPanels.tsx";
import { WorkflowSidebar } from "../components/WorkflowSidebar.tsx";
import { isSameDraft, toDraft } from "../lib/drafts.ts";
import { isWorkflowMarketplacePath, NEW_WORKFLOW_PATH } from "../lib/paths.ts";
import { useWorkflowDrafts, useWorkflowLaunch, useWorkflowsNavigation } from "../lib/workflowsShared.tsx";
import { duplicateWorkflow, useWorkflowImport } from "../lib/workflowTransfer.ts";

/** Navigator for the Workflows dashboard: running and recent runs, then installed workflows by category. */
export default function WorkflowLibraryView() {
  const { pathname } = useLocation();
  const { workflowName: routeName } = useParams<{ workflowName?: string }>();
  const workflows = useWorkflows();
  const workflowRuns = useWorkflowRuns();
  const { drafts } = useWorkflowDrafts();
  const { launch, launching } = useWorkflowLaunch();
  const { openOverview, openWorkflow, openCreate, openMarketplace, openRun } = useWorkflowsNavigation();

  const [duplicating, setDuplicating] = useState<string | null>(null);
  const workflowImport = useWorkflowImport(name => {
    void workflows.mutate();
    openWorkflow(name);
  });

  const handleDuplicate = async (name: string) => {
    setDuplicating(name);
    try {
      const created = await duplicateWorkflow(name);
      if (created) {
        void workflows.mutate();
        openWorkflow(created);
      }
    } finally {
      setDuplicating(null);
    }
  };

  const workflowList = (workflows.data ?? []) as Workflow[];
  const allRuns = useMemo(() => sortRunsNewestFirst((workflowRuns.data?.runs ?? []) as WorkflowRun[]), [workflowRuns.data]);
  const activeRuns = useMemo(() => allRuns.filter(isRunActive), [allRuns]);
  const recentFinishedRuns = useMemo(() => allRuns.filter(isRunFinished).slice(0, 8), [allRuns]);

  const dirtyNames = useMemo(() => {
    const names = new Set<string>();
    for (const workflow of workflowList) {
      const draft = drafts[workflow.name];
      if (draft && !isSameDraft(draft, toDraft(workflow))) names.add(workflow.name);
    }
    return names;
  }, [drafts, workflowList]);

  const creating = pathname === NEW_WORKFLOW_PATH;
  const selectedName = routeName && routeName !== "new" && !isWorkflowMarketplacePath(pathname) ? routeName : null;

  return (
    <>
      <WorkflowSidebar
        workflows={workflowList}
        isLoading={workflows.isLoading}
        loadError={workflows.error}
        onRetryLoad={() => void workflows.mutate()}
        selectedName={selectedName}
        creating={creating}
        dirtyNames={dirtyNames}
        activeRuns={activeRuns}
        recentFinishedRuns={recentFinishedRuns}
        launchingName={launching}
        onSelect={name => openWorkflow(name)}
        onNew={openCreate}
        onRun={name => void launch(name)}
        onWatchRun={openRun}
        onSelectRunWorkflow={name => openWorkflow(name)}
        onGoOverview={openOverview}
        onBrowseMarketplace={openMarketplace}
        onImportFile={file => void workflowImport.chooseFile(file)}
        onDuplicate={name => void handleDuplicate(name)}
        duplicatingName={duplicating}
      />
      {workflowImport.pending && (
        <ImportWorkflowDialog
          key={workflowImport.pending.fileName}
          fileName={workflowImport.pending.fileName}
          initialName={workflowImport.pending.suggestedName}
          existingNames={workflowList.map(workflow => workflow.name)}
          busy={workflowImport.busy}
          error={workflowImport.error}
          onImport={name => void workflowImport.confirm(name)}
          onClose={workflowImport.cancel}
        />
      )}
    </>
  );
}
