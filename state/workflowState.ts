import { AppStateSlice } from "@tokenring-ai/app/types";
import { z } from "zod";
import {
  MAX_STEP_OUTPUT_CHARS,
  type WorkflowRun,
  WorkflowRunSchema,
  type WorkflowRunStatus,
  type WorkflowRunStep,
  type WorkflowRunStepStatus,
} from "../schema.ts";

const serializationSchema = z.object({
  runs: z.array(WorkflowRunSchema),
});

/** The fields a caller supplies when a run is registered; the rest is bookkeeping. */
export type NewWorkflowRun = Pick<WorkflowRun, "id" | "workflowName" | "displayName" | "agentType" | "steps"> & {
  /** Pre-built per-step records; when omitted, pending records are derived from `steps`. */
  stepRecords?: WorkflowRunStep[];
  rerunOf?: string | null;
};

const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>([
  "completed",
  "completedWithErrors",
  "failed",
  "cancelled",
  "interrupted",
]);

export function isRunFinished(status: WorkflowRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export const INTERRUPTED_MESSAGE = "Interrupted by an application restart. It was not re-run; use Run again to start it again.";

/** Caps a step output or run message at {@link MAX_STEP_OUTPUT_CHARS}, so records and streams stay small. */
export function truncateRunText(text: string): string {
  return text.length > MAX_STEP_OUTPUT_CHARS ? `${text.slice(0, MAX_STEP_OUTPUT_CHARS)}…` : text;
}

/** A run that was in flight when the app stopped, as it is restored: interrupted, never re-run. */
export function markInterrupted(run: WorkflowRun): WorkflowRun {
  if (isRunFinished(run.status)) return run;
  return {
    ...run,
    status: "interrupted",
    message: INTERRUPTED_MESSAGE,
    finishedAt: Date.now(),
    stepRecords: run.stepRecords.map(record => (record.status === "running" ? { ...record, status: "cancelled", finishedAt: Date.now() } : record)),
  };
}

/**
 * App-level record of every workflow run: which agent is running it, which step it is on, and how it
 * ended. Finished runs are kept (trimmed to `maxFinishedRuns`) so the UI can show recent history.
 */
export class WorkflowState extends AppStateSlice<typeof serializationSchema> {
  runs: WorkflowRun[] = [];

  private maxFinishedRuns: number;

  constructor(maxFinishedRuns: number) {
    super("WorkflowState", serializationSchema);
    this.maxFinishedRuns = maxFinishedRuns;
  }

  /** Applies a configuration change and prunes finished runs that no longer fit. */
  setMaxFinishedRuns(maxFinishedRuns: number): void {
    this.maxFinishedRuns = maxFinishedRuns;
    this.trimFinishedRuns();
  }

  serialize(): z.output<typeof serializationSchema> {
    return { runs: this.runs.map(run => ({ ...run })) };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    // Agents don't survive a restart, so anything still in flight is recorded as interrupted rather
    // than left looking like it is still making progress. It is never re-run automatically.
    this.runs = data.runs.map(run => markInterrupted({ ...run }));
  }

  getRun(runId: string): WorkflowRun | null {
    return this.runs.find(run => run.id === runId) ?? null;
  }

  getRunByAgentId(agentId: string): WorkflowRun | null {
    return this.runs.find(run => run.agentId === agentId) ?? null;
  }

  addRun(run: NewWorkflowRun): WorkflowRun {
    const created: WorkflowRun = {
      ...run,
      steps: [...run.steps],
      stepRecords:
        run.stepRecords ??
        run.steps.map((step, _index) => ({
          label: typeof step === "string" ? step : step.command,
          status: "pending" as const,
          startedAt: null,
          finishedAt: null,
          output: "",
        })),
      agentId: null,
      jobId: null,
      rerunOf: run.rerunOf ?? null,
      costUsd: null,
      currentStep: 0,
      status: "starting",
      message: "",
      startedAt: Date.now(),
      finishedAt: null,
    };
    this.runs.push(created);
    this.trimFinishedRuns();
    return created;
  }

  /**
   * Adds runs restored from disk. A run already in state (same id, e.g. restored from an app
   * checkpoint, or started since) is kept as it is, and duplicates within `restored` count once.
   */
  restoreRuns(restored: WorkflowRun[]): void {
    const known = new Set(this.runs.map(run => run.id));
    const added: WorkflowRun[] = [];
    for (const run of restored) {
      if (known.has(run.id)) continue;
      known.add(run.id);
      added.push(run);
    }
    if (added.length === 0) return;
    this.runs = [...this.runs, ...added].sort((a, b) => a.startedAt - b.startedAt);
    this.trimFinishedRuns();
  }

  updateRun(runId: string, changes: Partial<Omit<WorkflowRun, "id">>): void {
    const run = this.getRun(runId);
    if (!run) return;
    Object.assign(run, changes);
    if (changes.message !== undefined) run.message = truncateRunText(changes.message);
  }

  /** Marks a step as started (running) and the run as such. */
  startStep(runId: string, index: number): void {
    const run = this.getRun(runId);
    if (!run) return;
    run.currentStep = index;
    run.status = "running";
    const record = run.stepRecords[index];
    if (record) {
      record.status = "running";
      record.startedAt = Date.now();
    }
  }

  /** Records the outcome of one step (without ending the run). */
  endStep(runId: string, index: number, status: Exclude<WorkflowRunStepStatus, "pending" | "running">, output: string): void {
    const run = this.getRun(runId);
    if (!run) return;
    const record = run.stepRecords[index];
    if (record) {
      record.status = status;
      record.finishedAt = Date.now();
      record.output = truncateRunText(output);
    }
  }

  finishRun(runId: string, status: WorkflowRunStatus, message: string): void {
    const run = this.getRun(runId);
    // A run can be finished out from under the step loop (cancellation); never double-finish.
    if (!run || isRunFinished(run.status)) return;
    run.status = status;
    run.message = truncateRunText(message);
    run.finishedAt = Date.now();
    if (status === "completed" || status === "completedWithErrors") run.currentStep = run.steps.length;
    this.trimFinishedRuns();
  }

  /**
   * Drops the oldest finished runs (by start time, matching the on-disk retention
   * prune); in-flight runs are never trimmed.
   */
  trimFinishedRuns(): void {
    const finished = this.runs.filter(run => isRunFinished(run.status)).sort((a, b) => a.startedAt - b.startedAt);
    const excess = finished.length - this.maxFinishedRuns;
    if (excess <= 0) return;
    const dropped = new Set(finished.slice(0, excess).map(run => run.id));
    this.runs = this.runs.filter(run => !dropped.has(run.id));
  }
}
