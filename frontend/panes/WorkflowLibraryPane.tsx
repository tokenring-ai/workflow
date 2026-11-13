import { useRouteParamsFor } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import { useWorkflowRuns, useWorkflows } from "@tokenring-ai/one-frontend/rpc.ts";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import { useMemo, useState } from "react";
import ImportWorkflowDialog from "../components/ImportWorkflowDialog.tsx";
import { isRunActive, sortRunsNewestFirst } from "../components/RunPanels.tsx";
import { WorkflowSidebar } from "../components/WorkflowSidebar.tsx";
import { WORKFLOW_CREATE_VIEW_ID, WORKFLOW_EDITOR_VIEW_ID } from "../ids.ts";
import { isSameDraft, toDraft } from "../lib/drafts.ts";
import { useWorkflowLaunch, useWorkflowLayoutNavigation } from "../lib/useWorkflowLayoutNavigation.ts";
import { useWorkflowDrafts } from "../lib/workflowState.tsx";
import { duplicateWorkflow, useWorkflowImport } from "../lib/workflowTransfer.ts";

/** Navigator for the Workflows app: installed workflows by category (runs are on the Runs page). */
export default function WorkflowLibraryPane() {
  const editorParams = useRouteParamsFor(WORKFLOW_EDITOR_VIEW_ID);
  const creating = useRouteParamsFor(WORKFLOW_CREATE_VIEW_ID) !== null;
  const workflows = useWorkflows();
  const workflowRuns = useWorkflowRuns();
  const { drafts } = useWorkflowDrafts();
  const { launch, launching } = useWorkflowLaunch();
  const { openOverview, openWorkflow, openCreate, openMarketplace } = useWorkflowLayoutNavigation();

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

  const dirtyNames = useMemo(() => {
    const names = new Set<string>();
    for (const workflow of workflowList) {
      const draft = drafts[workflow.name];
      if (draft && !isSameDraft(draft, toDraft(workflow))) names.add(workflow.name);
    }
    return names;
  }, [drafts, workflowList]);

  const selectedName = editorParams?.name ?? null;

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
        launchingName={launching}
        onSelect={name => openWorkflow(name)}
        onNew={openCreate}
        onRun={name => void launch(name)}
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
