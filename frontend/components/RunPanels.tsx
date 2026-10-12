import BusySpinner from "@tokenring-ai/one-frontend/components/ui/BusySpinner.tsx";
import ConfirmModal from "@tokenring-ai/one-frontend/components/ui/ConfirmModal.tsx";
import HistoryRunRow, { type HistoryRunStatus } from "@tokenring-ai/one-frontend/components/ui/HistoryRunRow.tsx";
import LaunchButton from "@tokenring-ai/one-frontend/components/ui/LaunchButton.tsx";
import StatusBadge, { type StatusBadgeDefinition } from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import { formatStepLabel } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import { runOrConfirm } from "@tokenring-ai/one-frontend/lib/uiPreferences.ts";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { formatDurationMs } from "@tokenring-ai/utility/date/formatDuration";
import type { WorkflowRun, WorkflowRunStatus } from "@tokenring-ai/workflow/schema";
import { CheckCircle2, Circle, ExternalLink, History, Loader2, OctagonX, RotateCcw, X, XCircle } from "lucide-react";
import { useState } from "react";

export function isRunActive(run: WorkflowRun): boolean {
  return run.status === "starting" || run.status === "running";
}

export function isRunFinished(run: WorkflowRun): boolean {
  return run.status === "completed" || run.status === "failed" || run.status === "cancelled";
}

/** Newest first; keeps active runs at the top, then finished by finish/start time. */
export function sortRunsNewestFirst(runs: WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((a, b) => {
    const aActive = isRunActive(a);
    const bActive = isRunActive(b);
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aTime = a.finishedAt ?? a.startedAt;
    const bTime = b.finishedAt ?? b.startedAt;
    return bTime - aTime;
  });
}

/** How long a finished step took, from its record; null while it runs or when it never started. */
export function stepDurationLabel(record: { startedAt: number | null; finishedAt: number | null } | undefined): string | null {
  if (record?.startedAt == null || record.finishedAt == null) return null;
  return formatDurationMs(Math.max(0, record.finishedAt - record.startedAt));
}

function runDurationLabel(run: WorkflowRun): string | null {
  if (run.finishedAt == null) return null;
  return formatDurationMs(Math.max(0, run.finishedAt - run.startedAt));
}

export function runTitle(run: WorkflowRun): string {
  return run.displayName || run.workflowName;
}

export function runStepSummary(run: WorkflowRun): string {
  if (run.status === "starting") return "Starting agent…";
  const step = run.steps[run.currentStep];
  if (step != null) return `Step ${run.currentStep + 1} of ${run.steps.length}: ${formatStepLabel(step)}`;
  return `Step ${run.currentStep + 1} of ${run.steps.length}`;
}

export function openRunLabel(run: WorkflowRun): string {
  const name = runTitle(run);
  return run.agentId ? `Watch ${name} run` : `View workflow ${name}`;
}

/** Amber-tinted count pill used for the running-workflow totals. */
export function RunningCountBadge({ count, live = false, className }: { count: number; live?: boolean; className?: string }) {
  return (
    <span
      className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-500", className)}
      aria-live={live ? "polite" : undefined}
    >
      {count} running
    </span>
  );
}

/** Card for one in-flight run, used on the installed overview. */
export function RunningWorkflowCard({ run, onOpen }: { run: WorkflowRun; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2.5 min-w-0 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer focus-ring bg-amber-500/5 border-amber-500/30 hover:bg-hover hover:border-amber-500/60"
      aria-label={openRunLabel(run)}
    >
      <span className="shrink-0 inline-flex" aria-hidden="true">
        <BusySpinner size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{runTitle(run)}</span>
          <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-500">{run.status === "starting" ? "Starting" : "Running"}</span>
        </span>
        <span className="block truncate text-xs text-muted">{runStepSummary(run)}</span>
      </span>
    </button>
  );
}

/** Card for one installed workflow, used on the overview launch grid. */
export function WorkflowCard({
  workflow,
  runningCount,
  launching,
  onView,
  onLaunch,
}: {
  workflow: { name: string; displayName: string; category: string; description: string };
  runningCount: number;
  launching: boolean;
  onView: () => void;
  onLaunch: () => void;
}) {
  const name = workflow.displayName || workflow.name;
  return (
    <div className="flex flex-col gap-2 min-w-0 bg-secondary border border-primary rounded-lg px-3 py-2.5 hover:border-cyan-500/40 transition-colors">
      <button type="button" onClick={onView} className="min-w-0 text-left cursor-pointer focus-ring rounded" aria-label={`View ${name}`}>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{name}</span>
        </span>
        <span className="block truncate text-xs text-muted">{workflow.category}</span>
      </button>
      <p className="text-xs text-secondary leading-relaxed line-clamp-2 min-w-0">{workflow.description || "No description provided."}</p>
      <div className="flex items-center justify-end gap-2 mt-auto">
        {runningCount > 0 ? <span className="mr-auto min-w-0 truncate text-xs text-muted">{runningCount} running</span> : null}
        <LaunchButton loading={launching} onClick={onLaunch} aria-label={`Launch ${name}`} title={`Launch ${name}`} className="shrink-0" />
      </div>
    </div>
  );
}

function toHistoryRunStatus(status: WorkflowRunStatus): HistoryRunStatus {
  if (status === "completed" || status === "failed" || status === "cancelled") return status;
  return "custom";
}

const RUN_STATUS_BADGES: Record<WorkflowRunStatus, StatusBadgeDefinition> = {
  starting: {
    label: "Starting",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    colorClass: "text-amber-600 dark:text-amber-400",
  },
  running: {
    label: "Running",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    colorClass: "text-amber-600 dark:text-amber-400",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="w-3 h-3" />,
    colorClass: "text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="w-3 h-3" />,
    colorClass: "text-red-600 dark:text-red-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: <X className="w-3 h-3" />,
    colorClass: "text-muted",
  },
};

export function RunStatusBadge({ status }: { status: WorkflowRunStatus }) {
  return <StatusBadge status={status} statuses={RUN_STATUS_BADGES} variant="inline" />;
}

/** Live step checklist for an in-flight (or just-finished) run, with cancel and open-agent actions. */
export function ActiveRunPanel({
  run,
  onOpenAgent,
  onCancel,
  cancelling,
  onRerun,
  rerunning = false,
}: {
  run: WorkflowRun;
  onOpenAgent: (id: string) => void;
  onCancel: (run: WorkflowRun) => void;
  cancelling: boolean;
  /** Offered once the run has finished: launches the same workflow again. */
  onRerun?: (run: WorkflowRun) => void;
  rerunning?: boolean;
}) {
  const active = isRunActive(run);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const requestCancel = () =>
    runOrConfirm(
      "Cancel workflow run?",
      () => setConfirmingCancel(true),
      () => onCancel(run),
    );

  // Prefer the backend's per-step records; older runs fall back to the index-derived states. The
  // schema defaults the array, so the declared type says it is always there, but runs that predate
  // the field still reach the UI without one - hence the runtime check rather than a plain read.
  const useRecords = Array.isArray(run.stepRecords) && run.stepRecords.length === run.steps.length;

  return (
    <div
      role="region"
      aria-label="Workflow run progress"
      className={`border rounded-xl overflow-hidden ${
        active
          ? "border-amber-500/40 bg-amber-500/5"
          : run.status === "completed"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : run.status === "failed"
              ? "border-red-500/30 bg-red-500/5"
              : "border-primary bg-secondary/40"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-primary/50">
        <RunStatusBadge status={run.status} />
        <span className="flex-1 min-w-0 text-xs text-muted truncate">
          {active
            ? run.status === "starting"
              ? "Spawning agent…"
              : `Step ${Math.min(run.currentStep + 1, run.steps.length)} of ${run.steps.length}`
            : run.message || run.status}
        </span>
        {active && (
          <button
            type="button"
            onClick={requestCancel}
            disabled={cancelling}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer focus-ring disabled:opacity-50 shrink-0"
          >
            {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <OctagonX className="w-3 h-3" />} Cancel
          </button>
        )}
        {onRerun && isRunFinished(run) && (
          <button
            type="button"
            onClick={() => onRerun(run)}
            disabled={rerunning}
            title="Launch this workflow again on a new agent"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors cursor-pointer focus-ring disabled:opacity-50 shrink-0"
          >
            {rerunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Re-run
          </button>
        )}
        {run.agentId && (
          <button
            type="button"
            onClick={() => onOpenAgent(run.agentId!)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors cursor-pointer focus-ring shrink-0"
          >
            <ExternalLink className="w-3 h-3" /> Open agent
          </button>
        )}
      </div>

      <ol className="px-3 py-2 space-y-1.5">
        {run.steps.map((step, index) => {
          const record = useRecords ? run.stepRecords[index] : undefined;
          let state: "done" | "current" | "pending" | "failed" | "cancelled" | "skipped" = "pending";
          if (record) {
            state = record.status === "running" ? "current" : record.status;
          } else if (run.status === "starting") {
            state = "pending";
          } else if (run.status === "completed" || index < run.currentStep) {
            state = "done";
          } else if (isRunActive(run) && index === run.currentStep) {
            state = "current";
          } else if (isRunFinished(run) && index === run.currentStep) {
            state = run.status === "cancelled" ? "cancelled" : "failed";
          }

          const output = record?.output.trim() ?? "";
          const duration = stepDurationLabel(record);

          return (
            <li key={index} className="flex items-start gap-2 min-w-0">
              <span className="mt-0.5 shrink-0">
                {state === "done" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : state === "current" ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                ) : state === "failed" ? (
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                ) : state === "cancelled" || state === "skipped" ? (
                  <X className="w-3.5 h-3.5 text-muted" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted/50" />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className={`block text-xs font-mono truncate ${
                    state === "current"
                      ? "text-primary font-medium"
                      : state === "done"
                        ? "text-muted"
                        : state === "failed"
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted/70"
                  }`}
                  title={formatStepLabel(step)}
                >
                  <span className="text-muted mr-1.5 not-italic font-sans">{index + 1}.</span>
                  {formatStepLabel(step)}
                </span>
                {duration && <span className="block text-xs text-muted tabular-nums">Took {duration}</span>}
                {output && state !== "current" && (
                  <span className="block text-xs text-muted/80 whitespace-pre-wrap break-words line-clamp-3" title={output}>
                    {output}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {confirmingCancel && (
        <ConfirmModal
          title="Cancel workflow run?"
          message={`This stops "${runTitle(run)}" mid-step and deletes the agent running it. Finished steps stay done; the rest will not run.`}
          confirmLabel="Cancel run"
          cancelLabel="Keep running"
          variant="warning"
          confirmIcon={OctagonX}
          onConfirm={() => {
            setConfirmingCancel(false);
            onCancel(run);
          }}
          onClose={() => setConfirmingCancel(false)}
          closeOnBackdrop
        />
      )}
    </div>
  );
}

export function WorkflowRunHistory({
  runs,
  emptyMessage,
  onOpenAgent,
  className,
}: {
  runs: WorkflowRun[];
  /** Shown only when `runs` is empty. Pass null to render nothing in that case. */
  emptyMessage: string | null;
  onOpenAgent: (id: string) => void;
  className?: string;
}) {
  if (runs.length === 0) {
    if (!emptyMessage) return null;
    return (
      <div className="border border-dashed border-primary rounded-xl px-3 py-4 text-center">
        <History className="w-5 h-5 text-muted mx-auto mb-1.5 opacity-50" />
        <p className="text-xs text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Workflow run history"
      className={cn("border border-primary rounded-xl bg-secondary/40 overflow-y-auto divide-y divide-primary/60", className)}
    >
      {runs.map(run => {
        const when = run.finishedAt ?? run.startedAt;
        const duration = runDurationLabel(run);
        return (
          <HistoryRunRow
            key={run.id}
            id={run.id}
            status={toHistoryRunStatus(run.status)}
            statusLabel={run.status}
            statusBadge={<RunStatusBadge status={run.status} />}
            startTime={when}
            endTime={run.finishedAt ?? undefined}
            duration={duration ?? undefined}
            message={run.message}
            showIcon={false}
            showTimestamp={false}
            className="px-3 py-2.5"
            action={
              run.agentId ? (
                <button
                  type="button"
                  onClick={() => onOpenAgent(run.agentId!)}
                  className="p-1 text-muted hover:text-cyan-600 dark:hover:text-cyan-400 rounded transition-colors cursor-pointer focus-ring shrink-0"
                  title="Open agent"
                  aria-label="Open agent for this run"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              ) : undefined
            }
          >
            {isRunActive(run) && run.steps.length > 0 ? (
              <p className="text-xs text-muted truncate">
                {run.status === "starting"
                  ? "Starting agent…"
                  : `Step ${run.currentStep + 1}/${run.steps.length}: ${run.steps[run.currentStep] != null ? formatStepLabel(run.steps[run.currentStep]!) : ""}`}
              </p>
            ) : null}
          </HistoryRunRow>
        );
      })}
    </div>
  );
}
