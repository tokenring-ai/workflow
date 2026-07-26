import { AppStateSlice } from "@tokenring-ai/app/types";
import { z } from "zod";
import { type WorkflowRun, WorkflowRunSchema, type WorkflowRunStatus } from "../schema.ts";

const serializationSchema = z.object({
  runs: z.array(WorkflowRunSchema),
});

/** The fields a caller supplies when a run is registered; the rest is bookkeeping. */
export type NewWorkflowRun = Pick<WorkflowRun, "id" | "workflowName" | "displayName" | "agentType" | "steps">;

const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>(["completed", "failed", "cancelled"]);

export function isRunFinished(status: WorkflowRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * App-level record of every workflow run: which agent is running it, which step it is on, and how it
 * ended. Finished runs are kept (trimmed to `maxFinishedRuns`) so the UI can show recent history.
 */
export class WorkflowState extends AppStateSlice<typeof serializationSchema> {
  runs: WorkflowRun[] = [];

  constructor(readonly maxFinishedRuns: number) {
    super("WorkflowState", serializationSchema);
  }

  serialize(): z.output<typeof serializationSchema> {
    return { runs: this.runs.map(run => ({ ...run })) };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    // Agents don't survive a restart, so anything still in flight is recorded as cancelled rather
    // than left looking like it is still making progress.
    this.runs = data.runs.map(run =>
      isRunFinished(run.status) ? { ...run } : { ...run, status: "cancelled", message: "Interrupted by an application restart", finishedAt: Date.now() },
    );
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
      agentId: null,
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

  updateRun(runId: string, changes: Partial<Omit<WorkflowRun, "id">>): void {
    const run = this.getRun(runId);
    if (!run) return;
    Object.assign(run, changes);
  }

  finishRun(runId: string, status: WorkflowRunStatus, message: string): void {
    const run = this.getRun(runId);
    if (!run) return;
    run.status = status;
    run.message = message;
    run.finishedAt = Date.now();
    if (status === "completed") run.currentStep = run.steps.length;
    this.trimFinishedRuns();
  }

  /** Drops the oldest finished runs; in-flight runs are never trimmed. */
  private trimFinishedRuns(): void {
    const finished = this.runs.filter(run => isRunFinished(run.status));
    const excess = finished.length - this.maxFinishedRuns;
    if (excess <= 0) return;
    const dropped = new Set(finished.slice(0, excess).map(run => run.id));
    this.runs = this.runs.filter(run => !dropped.has(run.id));
  }
}
