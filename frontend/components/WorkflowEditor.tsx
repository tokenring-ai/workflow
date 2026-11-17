import Editor from "@monaco-editor/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@tokenring-ai/one-frontend/components/ui/dropdown-menu.tsx";
import LaunchButton from "@tokenring-ai/one-frontend/components/ui/LaunchButton.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewModeToggle from "@tokenring-ai/one-frontend/components/ui/ViewModeToggle.tsx";
import AutoResizeTextarea from "@tokenring-ai/one-frontend/features/workflows/AutoResizeTextarea.tsx";
import type { AvailableAgentCommand } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import { isStepFilled } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import StepEditor from "@tokenring-ai/one-frontend/features/workflows/StepEditor.tsx";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useMonacoTheme } from "@tokenring-ai/one-frontend/theme/bridges/useMonacoTheme.ts";
import { Button } from "@tokenring-ai/one-frontend/ui";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  MoreHorizontal,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { isValidWorkflowName, normalizeDraft, parseWorkflowYaml, type WorkflowDraft, workflowNameError, workflowYaml } from "../lib/drafts.ts";
import { useAgentTypeLabel } from "../lib/useWorkflowLayoutNavigation.ts";
import { ActiveRunPanel, isRunFinished, WorkflowRunHistory } from "./RunPanels.tsx";
import SubAgentSettingsEditor from "./SubAgentSettingsEditor.tsx";

type EditorView = "form" | "yaml";

/** One label style for every field in the form, matching the step editor's. */
const labelClass = "text-xs font-medium text-muted";

export default function WorkflowEditor({
  workflowName,
  creating,
  nameValue,
  onNameChange,
  draft,
  onDraftChange,
  savedWorkflow,
  isDirty,
  activeRun,
  workflowRuns,
  categories,
  agentTypes,
  commands,
  saving,
  launching,
  onSave,
  onRevert,
  onDelete,
  onClone,
  onDownload,
  onLaunch,
  onCancelCreate,
  onOpenAgent,
  onOpenRun,
  onCancelRun,
  cancellingRunId,
}: {
  workflowName: string | null;
  creating: boolean;
  nameValue: string;
  onNameChange: (value: string) => void;
  draft: WorkflowDraft;
  onDraftChange: (draft: WorkflowDraft) => void;
  savedWorkflow: Workflow | null;
  isDirty: boolean;
  activeRun: WorkflowRun | null;
  /** All tracked runs for this workflow (active + finished), newest first. */
  workflowRuns: WorkflowRun[];
  categories: string[];
  agentTypes: { type: string; displayName: string; category?: string }[];
  commands: AvailableAgentCommand[];
  saving: boolean;
  launching: boolean;
  onSave: () => void;
  onRevert: () => void;
  onDelete: () => void;
  onClone: () => void;
  /** Downloads the saved workflow as YAML. */
  onDownload: () => void;
  onLaunch: () => void;
  onCancelCreate: () => void;
  onOpenAgent: (id: string) => void;
  /** Opens a run's detail page. */
  onOpenRun: (run: WorkflowRun) => void;
  onCancelRun: (run: WorkflowRun) => void;
  cancellingRunId: string | null;
}) {
  const monacoTheme = useMonacoTheme();
  const agentLabel = useAgentTypeLabel();
  const [view, setView] = useState<EditorView>("form");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [yamlText, setYamlText] = useState<string | null>(null);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const missingId = useId();

  const trimmedName = nameValue.trim();
  const nameError = creating ? workflowNameError(trimmedName) : null;
  const hasSteps = draft.steps.some(isStepFilled);
  const yamlInvalid = view === "yaml" && yamlError !== null;
  const canSave =
    !yamlInvalid &&
    !saving &&
    draft.displayName.trim() !== "" &&
    draft.agentType.trim() !== "" &&
    hasSteps &&
    (creating ? isValidWorkflowName(trimmedName) : isDirty);
  // What still blocks saving, spelled out next to the disabled Save button.
  const missing: string[] = [];
  if (creating && !isValidWorkflowName(trimmedName)) missing.push(trimmedName ? "A valid name" : "A name");
  if (draft.displayName.trim() === "") missing.push("A display name");
  if (draft.agentType.trim() === "") missing.push("An agent type");
  if (!hasSteps) missing.push("At least one step");
  if (yamlInvalid) missing.push("Valid YAML");
  const unknownAgentType = draft.agentType !== "" && agentTypes.length > 0 && !agentTypes.some(a => a.type === draft.agentType);

  // Cmd/Ctrl+S is the Save button: it obeys the same checks, so it can't write a workflow with no
  // agent type or steps, or the last valid draft while the YAML on screen is broken.
  const panel = usePanel();
  useKeyboardShortcuts([{ key: "s", allowInEditable: true, enabled: panel.isActive && canSave, handler: onSave }]);

  const title = creating ? "New workflow" : draft.displayName || workflowName || "";
  // The live run gets its step checklist; otherwise one line says how the last run ended.
  const lastFinished = workflowRuns.find(isRunFinished) ?? null;
  const historyRuns = workflowRuns.filter(run => run.id !== activeRun?.id);

  const enterYaml = () => {
    setYamlText(workflowYaml(normalizeDraft(draft)));
    setYamlError(null);
    setView("yaml");
  };
  const enterForm = () => {
    setYamlText(null);
    setYamlError(null);
    setView("form");
  };
  // The draft the YAML text was last parsed into. When the draft changes some other way (Revert,
  // a reload from disk) the text is rewritten from it; otherwise the stale text would be re-applied
  // on the next keystroke.
  const parsedFromYaml = useRef<string | null>(null);
  const draftKey = JSON.stringify(normalizeDraft(draft));
  useEffect(() => {
    if (view !== "yaml" || draftKey === parsedFromYaml.current) return;
    parsedFromYaml.current = draftKey;
    setYamlText(workflowYaml(normalizeDraft(draft)));
    setYamlError(null);
    // Only a change of the draft itself should rewrite the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, view]);

  const handleYamlChange = (text: string) => {
    setYamlText(text);
    try {
      const parsed = parseWorkflowYaml(text);
      parsedFromYaml.current = JSON.stringify(normalizeDraft(parsed));
      onDraftChange(parsed);
      setYamlError(null);
    } catch (error) {
      setYamlError(formatError(error));
    }
  };

  // Create is the primary action of the new-workflow form; on an existing workflow Run is, so Save is secondary.
  const saveButton = (variant: "primary" | "secondary", label: string) => (
    <Button
      variant={variant}
      icon={Save}
      busy={saving}
      onClick={onSave}
      disabled={!canSave}
      aria-describedby={missing.length > 0 && (creating || isDirty) ? missingId : undefined}
      title={missing.length > 0 ? `Still needed: ${missing.join(", ")}` : "Save (Cmd/Ctrl+S)"}
    >
      {label}
    </Button>
  );

  return (
    <div className="h-full flex flex-col bg-primary">
      <ViewHeader
        title={title}
        subtitle={
          creating ? (
            "Define the steps this workflow runs"
          ) : isDirty || activeRun ? (
            // One line: the header bar is a fixed height. The file name is next to the Name field below.
            <span className="flex min-w-0 items-center gap-2 truncate text-xs">
              {isDirty && <span className="text-warning font-medium">Unsaved changes</span>}
              {activeRun && (
                <span className="text-accent font-medium">
                  {activeRun.status === "starting" ? "Starting agent…" : `Running step ${activeRun.currentStep + 1} of ${activeRun.steps.length}`}
                </span>
              )}
            </span>
          ) : null
        }
      >
        {creating ? (
          <>
            <button
              type="button"
              onClick={onCancelCreate}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
            {saveButton("primary", "Create")}
          </>
        ) : (
          <>
            {activeRun?.agentId && (
              <button
                type="button"
                onClick={() => onOpenAgent(activeRun.agentId!)}
                title="Open the agent running this workflow"
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open agent
              </button>
            )}
            {saveButton("secondary", "Save")}
            <LaunchButton
              loading={launching}
              onClick={() => onLaunch()}
              label="Run"
              title={isDirty ? "Runs the saved version — save first" : "Run this workflow on a new agent; it may stop to ask you questions"}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More workflow actions"
                  title="More workflow actions"
                  className="p-1.5 text-muted hover:text-primary border border-primary rounded-lg transition-colors cursor-pointer focus-ring"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2 text-xs" onSelect={onClone}>
                  <Copy className="w-3.5 h-3.5 text-muted" aria-hidden="true" /> Clone
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onSelect={onDownload}>
                  <Download className="w-3.5 h-3.5 text-muted" aria-hidden="true" /> {isDirty ? "Download saved YAML" : "Download YAML"}
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" disabled={!isDirty} onSelect={onRevert}>
                  <RotateCcw className="w-3.5 h-3.5 text-muted" aria-hidden="true" /> Revert unsaved changes
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs text-error" onSelect={onDelete}>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete workflow…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* One left edge with the header (both px-3); the column is not centred. */}
        <div className="max-w-3xl space-y-5">
          {missing.length > 0 && (creating || isDirty) && (
            <div id={missingId} role="status" className="px-3 py-2 rounded-lg border border-line bg-warning/10 text-xs">
              <p className="font-medium text-warning">To {creating ? "create" : "save"} this workflow, add:</p>
              <ul className="mt-1 space-y-0.5 text-secondary">
                {missing.map(item => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Circle className="w-2.5 h-2.5 text-muted shrink-0" aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ViewModeToggle
              aria-label="Form or YAML editing"
              value={view}
              onChange={mode => (mode === "yaml" ? enterYaml() : enterForm())}
              options={[
                { value: "form", label: "Form", title: "Edit fields and steps", icon: FileText },
                { value: "yaml", label: "YAML", title: "Edit the raw workflow YAML", icon: Code2 },
              ]}
            />
            {!creating && (
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted">
                {lastFinished ? (
                  <span className="min-w-0 truncate">
                    Last run: <span className="capitalize">{lastFinished.status}</span> ·{" "}
                    {formatRelativeTime(lastFinished.finishedAt ?? lastFinished.startedAt)} ·{" "}
                    <button type="button" onClick={() => onOpenRun(lastFinished)} className="text-accent hover:underline cursor-pointer focus-ring rounded">
                      Open
                    </button>
                  </span>
                ) : (
                  !activeRun && <span>No runs yet. Press Run to start one.</span>
                )}
                {historyRuns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(open => !open)}
                    aria-expanded={historyOpen}
                    className="inline-flex items-center gap-0.5 shrink-0 rounded px-1 py-0.5 hover:text-primary hover:bg-hover cursor-pointer focus-ring"
                  >
                    {historyOpen ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
                    History ({historyRuns.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {!creating && activeRun && (
            <ActiveRunPanel run={activeRun} onOpenAgent={onOpenAgent} onCancel={onCancelRun} cancelling={cancellingRunId === activeRun.id} />
          )}
          {!creating && historyOpen && historyRuns.length > 1 && (
            <WorkflowRunHistory runs={historyRuns} emptyMessage={null} onOpenAgent={onOpenAgent} agentLabel={agentLabel} />
          )}

          {view === "yaml" ? (
            <div className="space-y-2">
              {yamlError && (
                <p className="flex items-start gap-1.5 text-xs text-error" role="alert">
                  <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap break-words">{yamlError}</span>
                </p>
              )}
              <div className="border border-primary rounded-lg overflow-hidden h-[480px] bg-primary">
                <Editor
                  height="100%"
                  language="yaml"
                  value={yamlText ?? ""}
                  onChange={value => handleYamlChange(value ?? "")}
                  beforeMount={monacoTheme.beforeMount}
                  theme={monacoTheme.theme}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    tabSize: 2,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: "on",
                    padding: { top: 8 },
                  }}
                />
              </div>
              <p className="text-xs text-muted flex items-center gap-1.5">
                {yamlError ? (
                  <>
                    <XCircle className="w-3 h-3 text-error" /> Fix the YAML error to enable saving; the form holds the last valid version.
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-success" /> Valid workflow YAML — edits apply to the form live.
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="workflow-name" className={labelClass}>
                    {creating ? "Name" : "File name"}
                  </label>
                  <input
                    id="workflow-name"
                    type="text"
                    value={creating ? nameValue : `${workflowName ?? ""}.yaml`}
                    onChange={e => onNameChange(e.target.value)}
                    disabled={!creating}
                    title={savedWorkflow ? `Updated ${new Date(savedWorkflow.updatedAt).toLocaleString()}` : undefined}
                    placeholder="myWorkflow"
                    spellCheck={false}
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm font-mono text-primary placeholder-muted focus-accent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {nameError && <p className="text-xs text-error">{nameError}</p>}
                </div>
                <div className="space-y-1">
                  <label htmlFor="workflow-display-name" className={labelClass}>
                    Display name
                  </label>
                  <input
                    id="workflow-display-name"
                    type="text"
                    value={draft.displayName}
                    onChange={e => onDraftChange({ ...draft, displayName: e.target.value })}
                    placeholder="All-Package Bug Hunter"
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus-accent"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="workflow-category" className={labelClass}>
                    Category
                  </label>
                  <input
                    id="workflow-category"
                    type="text"
                    list="workflow-category-options"
                    value={draft.category}
                    onChange={e => onDraftChange({ ...draft, category: e.target.value })}
                    placeholder="User-Created Workflows"
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus-accent"
                  />
                  <datalist id="workflow-category-options">
                    {categories.map(category => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <label htmlFor="workflow-agent-type" className={labelClass}>
                    Agent type
                  </label>
                  <select
                    id="workflow-agent-type"
                    value={draft.agentType}
                    onChange={e => onDraftChange({ ...draft, agentType: e.target.value })}
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary focus-accent cursor-pointer"
                  >
                    <option value="">Select an agent type…</option>
                    {unknownAgentType && <option value={draft.agentType}>{draft.agentType} (not installed)</option>}
                    {agentTypes.map(agentType => (
                      <option key={agentType.type} value={agentType.type}>
                        {agentType.displayName} ({agentType.type})
                      </option>
                    ))}
                  </select>
                  {unknownAgentType && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <TriangleAlert className="w-3 h-3 shrink-0" /> This agent type is not currently configured.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="workflow-description" className={labelClass}>
                  Description
                </label>
                <AutoResizeTextarea
                  id="workflow-description"
                  value={draft.description}
                  onChange={e => onDraftChange({ ...draft, description: e.target.value })}
                  minRows={2}
                  maxRows={20}
                  placeholder="What this workflow does"
                  className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus-accent"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={labelClass}>Steps</span>
                  <span className="text-xs text-muted">Chat messages or structured agent commands</span>
                </div>
                <StepEditor steps={draft.steps} onChange={steps => onDraftChange({ ...draft, steps })} commands={commands} />
                {!hasSteps && <p className="text-xs text-error">Add at least one step.</p>}
              </div>

              <SubAgentSettingsEditor value={draft.subAgent} onChange={subAgent => onDraftChange({ ...draft, subAgent })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
