import Editor from "@monaco-editor/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@tokenring-ai/one-frontend/components/ui/dropdown-menu.tsx";
import LaunchButton from "@tokenring-ai/one-frontend/components/ui/LaunchButton.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewModeToggle from "@tokenring-ai/one-frontend/components/ui/ViewModeToggle.tsx";
import AutoResizeTextarea from "@tokenring-ai/one-frontend/features/workflows/AutoResizeTextarea.tsx";
import type { AvailableAgentCommand } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import { isStepFilled } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import StepEditor from "@tokenring-ai/one-frontend/features/workflows/StepEditor.tsx";
import { useMonacoTheme } from "@tokenring-ai/one-frontend/theme/bridges/useMonacoTheme.ts";
import { Button } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { Workflow, WorkflowRun } from "@tokenring-ai/workflow/schema";
import {
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  MoreHorizontal,
  Play,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useId, useState } from "react";
import { isValidWorkflowName, normalizeDraft, parseWorkflowYaml, type WorkflowDraft, workflowNameError, workflowYaml } from "../lib/drafts.ts";
import { ActiveRunPanel, isRunFinished, WorkflowRunHistory } from "./RunPanels.tsx";
import SubAgentSettingsEditor from "./SubAgentSettingsEditor.tsx";

type EditorView = "form" | "yaml";

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
  onLaunch: (options?: { headless?: boolean }) => void;
  onCancelCreate: () => void;
  onOpenAgent: (id: string) => void;
  onCancelRun: (run: WorkflowRun) => void;
  cancellingRunId: string | null;
}) {
  const monacoTheme = useMonacoTheme();
  const [view, setView] = useState<EditorView>("form");
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

  const title = creating ? "New workflow" : draft.displayName || workflowName || "";
  // Prefer the live run; otherwise feature the most recent finished run with its step checklist.
  const featuredRunId = activeRun?.id ?? (workflowRuns[0] && isRunFinished(workflowRuns[0]) ? workflowRuns[0]!.id : null);
  const featuredRun = featuredRunId ? (activeRun ?? workflowRuns.find(run => run.id === featuredRunId) ?? null) : null;
  // Full history (newest first), scrollable — no hard truncation.
  const historyRuns = workflowRuns.filter(run => run.id !== featuredRunId);

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
  const handleYamlChange = (text: string) => {
    setYamlText(text);
    try {
      onDraftChange(parseWorkflowYaml(text));
      setYamlError(null);
    } catch (error) {
      setYamlError(formatError(error));
    }
  };

  return (
    <div className="h-full flex flex-col bg-primary">
      <ViewHeader
        title={title}
        subtitle={
          creating ? (
            "Define the steps this workflow runs"
          ) : (
            // One line: the header bar is a fixed height. The save time is in the tooltip.
            <span
              className="flex min-w-0 items-center gap-2 truncate"
              title={savedWorkflow ? `Updated ${new Date(savedWorkflow.updatedAt).toLocaleString()}` : undefined}
            >
              <code className="font-mono">{workflowName}.yaml</code>
              {isDirty && <span className="text-warning font-medium">· unsaved changes</span>}
              {activeRun && (
                <span className="text-accent font-medium">
                  · {activeRun.status === "starting" ? "starting agent…" : `running step ${activeRun.currentStep + 1} of ${activeRun.steps.length}`}
                </span>
              )}
            </span>
          )
        }
        icon={<GitBranch />}
        iconGradient="from-cyan-500 to-blue-600"
      >
        {creating ? (
          <button
            type="button"
            onClick={onCancelCreate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring"
          >
            <XCircle className="w-3.5 h-3.5" /> Cancel
          </button>
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
            <LaunchButton
              loading={launching}
              onClick={() => onLaunch()}
              label="Run"
              title="Run this workflow on a new agent; it may stop to ask you questions"
              bgClassName="bg-cyan-600 hover:bg-cyan-500"
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
                <DropdownMenuItem className="gap-2 text-xs" disabled={launching} onSelect={() => onLaunch({ headless: true })}>
                  <Play className="w-3.5 h-3.5 text-muted" aria-hidden="true" /> Run headless (never asks you)
                </DropdownMenuItem>
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
        <Button
          variant="primary"
          icon={Save}
          busy={saving}
          onClick={onSave}
          disabled={!canSave}
          aria-describedby={missing.length > 0 && (creating || isDirty) ? missingId : undefined}
          title={missing.length > 0 ? `Still needed: ${missing.join(", ")}` : "Save (Cmd/Ctrl+S)"}
          className="font-semibold"
        >
          {creating ? "Create" : "Save"}
        </Button>
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-5">
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
          {!creating && (
            <section className="space-y-2" aria-label="Run monitoring">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">Runs</span>
                <span className="text-xs text-muted">Live progress and history</span>
              </div>
              {featuredRun && (
                <ActiveRunPanel run={featuredRun} onOpenAgent={onOpenAgent} onCancel={onCancelRun} cancelling={cancellingRunId === featuredRun.id} />
              )}
              <WorkflowRunHistory
                runs={historyRuns}
                emptyMessage={featuredRun ? null : "No runs yet for this workflow. Launch it to see progress here."}
                onOpenAgent={onOpenAgent}
                className="max-h-96"
              />
            </section>
          )}

          <ViewModeToggle
            aria-label="Form or YAML editing"
            value={view}
            onChange={mode => (mode === "yaml" ? enterYaml() : enterForm())}
            options={[
              { value: "form", label: "Form", title: "Edit fields and steps", icon: FileText },
              { value: "yaml", label: "YAML", title: "Edit the raw workflow YAML", icon: Code2 },
            ]}
          />

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
                  <label htmlFor="workflow-name" className="text-xs font-semibold text-muted uppercase tracking-wide">
                    Name {creating ? "" : "(file name, fixed)"}
                  </label>
                  <input
                    id="workflow-name"
                    type="text"
                    value={creating ? nameValue : (workflowName ?? "")}
                    onChange={e => onNameChange(e.target.value)}
                    disabled={!creating}
                    placeholder="myWorkflow"
                    spellCheck={false}
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-xs font-mono text-primary placeholder-muted focus-accent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {nameError && <p className="text-xs text-error">{nameError}</p>}
                </div>
                <div className="space-y-1">
                  <label htmlFor="workflow-display-name" className="text-xs font-semibold text-muted uppercase tracking-wide">
                    Display name
                  </label>
                  <input
                    id="workflow-display-name"
                    type="text"
                    value={draft.displayName}
                    onChange={e => onDraftChange({ ...draft, displayName: e.target.value })}
                    placeholder="All-Package Bug Hunter"
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-xs text-primary placeholder-muted focus-accent"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="workflow-category" className="text-xs font-semibold text-muted uppercase tracking-wide">
                    Category
                  </label>
                  <input
                    id="workflow-category"
                    type="text"
                    list="workflow-category-options"
                    value={draft.category}
                    onChange={e => onDraftChange({ ...draft, category: e.target.value })}
                    placeholder="User-Created Workflows"
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-xs text-primary placeholder-muted focus-accent"
                  />
                  <datalist id="workflow-category-options">
                    {categories.map(category => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <label htmlFor="workflow-agent-type" className="text-xs font-semibold text-muted uppercase tracking-wide">
                    Agent type
                  </label>
                  <select
                    id="workflow-agent-type"
                    value={draft.agentType}
                    onChange={e => onDraftChange({ ...draft, agentType: e.target.value })}
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-xs text-primary focus-accent cursor-pointer"
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
                <label htmlFor="workflow-description" className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Description
                </label>
                <AutoResizeTextarea
                  id="workflow-description"
                  value={draft.description}
                  onChange={e => onDraftChange({ ...draft, description: e.target.value })}
                  minRows={2}
                  maxRows={20}
                  placeholder="What this workflow does"
                  className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-xs text-primary placeholder-muted focus-accent"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wide">Steps</span>
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
