import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type Agent, AgentCommandService, AgentJobService, AgentManager, type JobOrigin, type JobSession } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import writeYamlAtomic from "@tokenring-ai/app/config/writeYamlAtomic";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { ConfigurationError } from "@tokenring-ai/app/types";
import formatError from "@tokenring-ai/utility/error/formatError";
import { YAML } from "bun";
import type { z } from "zod";
import { formatWorkflowStep } from "./formatWorkflowStep.ts";
import {
  MAX_STEP_RETRIES,
  type ParsedWorkflowConfig,
  type Workflow,
  type WorkflowItemInput,
  WorkflowItemSchema,
  type WorkflowRun,
  WorkflowRunSchema,
  type WorkflowRunStatus,
  WorkflowServiceConfigSchema,
  type WorkflowStep,
} from "./schema.ts";
import { isRunFinished, markInterrupted, truncateRunText, WorkflowState } from "./state/workflowState.ts";

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const EXTENSION = ".yaml";
const RUNS_DIRECTORY = ".runs";

const FILE_HEADER = "# TokenRing workflow definition. The file name is the workflow name.";

const EXPORT_HEADER = "# TokenRing workflow export. Import it from the Workflows dashboard; `name` is the suggested workflow name.";

/**
 * Names that collide with Workflows dashboard routes (`/workflows/new`, `/workflows/marketplace`).
 * Mirrors RESERVED_WORKFLOW_NAMES in frontend/lib/drafts.ts.
 */
const RESERVED_NAMES = new Set(["new", "marketplace"]);

function assertValidName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid workflow name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`,
    );
  }
}

function assertNotReserved(name: string): void {
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new Error(`"${name}" is reserved by the Workflows dashboard; pick another name.`);
  }
}

/** Formats zod issues as one readable line each, e.g. `steps.1.command: Too small`. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map(issue => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`).join("; ");
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * Per-step execution options. Structured steps carry their own; plain-string
 * steps use these defaults.
 */
function stepExecutionOptions(step: WorkflowStep): { onError: "stop" | "continue"; retries: number } {
  return typeof step === "string"
    ? { onError: "stop", retries: 0 }
    : { onError: step.onError ?? "stop", retries: Math.min(Math.max(step.retries ?? 0, 0), MAX_STEP_RETRIES) };
}

/** How a run is started. */
export type StartRunOptions = {
  /**
   * The agent whose command or tool starts the run. The run's job is then that agent's job's child:
   * it counts toward the job depth and fan-out limits and is cancelled with its parent.
   */
  startedBy?: Agent | undefined;
  /** Who started it, for a run a person started (UI / RPC); shown in the job list. */
  personLabel?: string | undefined;
  /** A schedule that started the run, recorded as its job's origin (instead of a person). */
  origin?: Extract<JobOrigin, { kind: "schedule" }> | undefined;
  /** The finished run this one runs again. */
  rerunOf?: string | undefined;
  /** Spending limit for the run's job (USD); default `agent.jobs.defaultMaxCostUsd`. */
  maxCostUsd?: number | undefined;
  /** Highest approval level the run may auto-approve; default `agent.jobs.maxAutoApprovalLevel`, capped at `agent.jobs.approvalCeiling`. */
  maxApprovalLevel?: number | undefined;
};

export type StartedRun = { runId: string; jobId: string; agent: Agent };

/**
 * Manages multi-step agent workflows stored as YAML files on disk, and runs them.
 *
 * Layout: `<workflowDirectory>/<name>.yaml`, with finished runs archived under
 * `<workflowDirectory>/.runs/<runId>.json`.
 *
 * Running a workflow spawns an agent of the workflow's agent type and feeds it one step at a time,
 * recording progress (including per-step records) in {@link WorkflowState} and persisting run
 * records to disk so history survives restarts.
 */
export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  description = "Manages multi-step agent workflows, backed by YAML files on disk";

  private config = WorkflowServiceConfigSchema.parse({});

  constructor(private app: TokenRingApp) {
    this.app.initializeState(WorkflowState, this.config.maxFinishedRuns);
  }

  reconfigure(newConfig: ParsedWorkflowConfig): void {
    this.config = newConfig;
    this.app.getState(WorkflowState).setMaxFinishedRuns(newConfig.maxFinishedRuns);
  }

  getWorkflowDirectory(): string {
    return this.app.getWorkspaceResolvedPath(this.config.workflowDirectory);
  }

  private getRunsDirectory(): string {
    return path.join(this.getWorkflowDirectory(), RUNS_DIRECTORY);
  }

  /**
   * Loads run records persisted by previous sessions into state, so run history survives
   * restarts. Runs that were still in flight when the process died are recorded as interrupted
   * (and saved so) — never re-run automatically; they can be run again. A run already in state
   * (same id) is kept as it is, so loading twice, or after an app checkpoint restored state, never
   * duplicates runs.
   *
   * Runs on the persistence queue, so a prune queued by a run finishing meanwhile cannot delete
   * records that are not loaded yet. Missing directory is normal (nothing has run yet); other read
   * errors are logged, not fatal.
   */
  loadRunHistory(): Promise<void> {
    const task = this.persistQueue.then(() => this.readRunHistory());
    this.persistQueue = task.catch((error: unknown) => {
      console.error(`Unable to load workflow run history: ${formatError(error)}`);
    });
    return this.persistQueue;
  }

  private async readRunHistory(): Promise<void> {
    const runsDirectory = this.getRunsDirectory();
    let entries: string[];
    try {
      entries = await fs.readdir(runsDirectory);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      console.error(`Unable to read workflow run history: ${formatError(error)}`);
      return;
    }

    const runs: WorkflowRun[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const parsed = WorkflowRunSchema.parse(JSON.parse(await fs.readFile(path.join(runsDirectory, entry), "utf8")));
        if (isRunFinished(parsed.status)) {
          runs.push(parsed);
          continue;
        }
        const interrupted = markInterrupted(parsed);
        runs.push(interrupted);
        await fs.writeFile(path.join(runsDirectory, entry), JSON.stringify(interrupted, null, 2));
      } catch (error) {
        console.error(`Skipping invalid workflow run record ${entry}: ${formatError(error)}`);
      }
    }

    this.app.mutateState(WorkflowState, state => state.restoreRuns(runs));
  }

  /**
   * Lists every valid workflow in the workflow directory, sorted by name. Files
   * that fail to parse are skipped so one bad file cannot hide the rest.
   */
  async listWorkflows(): Promise<Workflow[]> {
    const root = this.getWorkflowDirectory();
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const workflows: Workflow[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue;
      const workflowName = entry.slice(0, -EXTENSION.length);
      if (!NAME_PATTERN.test(workflowName)) continue;
      try {
        const workflow = await this.readWorkflowFile(path.join(root, entry), workflowName);
        if (workflow) workflows.push(workflow);
      } catch (error) {
        console.error(`Skipping invalid workflow file ${entry}: ${formatError(error)}`);
      }
    }

    return workflows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWorkflow(workflowName: string): Promise<Workflow | null> {
    return this.readWorkflowFile(this.resolveWorkflowPath(workflowName), workflowName);
  }

  async createWorkflow(workflowName: string, workflow: WorkflowItemInput): Promise<Workflow> {
    const filePath = this.resolveWorkflowPath(workflowName);
    assertNotReserved(workflowName);
    if (await pathExists(filePath)) {
      throw new Error(`Workflow "${workflowName}" already exists`);
    }
    return this.writeWorkflowFile(filePath, workflowName, workflow);
  }

  /**
   * Serializes a workflow for download: the file body plus a `name` hint the importer uses as the
   * default workflow name. `installedFrom` is dropped — an exported copy is no longer tied to the
   * marketplace item it came from.
   */
  async exportWorkflow(workflowName: string): Promise<{ fileName: string; yaml: string }> {
    const workflow = await this.getWorkflow(workflowName);
    if (!workflow) throw new Error(`Workflow "${workflowName}" not found`);
    const { name, updatedAt: _updatedAt, installedFrom: _installedFrom, ...item } = workflow;
    const yaml = YAML.stringify({ name, ...item }, null, 2).trimEnd();
    return { fileName: `${name}${EXTENSION}`, yaml: `${EXPORT_HEADER}\n${yaml}\n` };
  }

  /**
   * Creates a workflow from exported (or hand-written) YAML. The name is `name` when given,
   * otherwise the file's `name` key. Validates the body against the workflow schema and refuses
   * to overwrite an existing workflow.
   */
  async importWorkflow(yaml: string, name?: string): Promise<Workflow> {
    let parsed: unknown;
    try {
      parsed = YAML.parse(yaml);
    } catch (error) {
      throw new Error(`Not valid YAML: ${formatError(error)}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("A workflow file must be a YAML mapping (displayName, agentType, steps, …).");
    }

    const fileName = (parsed as { name?: unknown }).name;
    const workflowName = (name ?? (typeof fileName === "string" ? fileName : "")).trim();
    if (!workflowName) throw new Error("The file has no `name`; choose a name for the imported workflow.");

    const result = WorkflowItemSchema.safeParse(parsed);
    if (!result.success) throw new Error(`Invalid workflow file: ${describeIssues(result.error)}`);
    const { installedFrom: _installedFrom, ...item } = result.data;
    return this.createWorkflow(workflowName, item);
  }

  /**
   * Copies a workflow under a new name: `newName`, or the first free `<name>-copy`, `<name>-copy2`, …
   * (the same scheme as the editor's Clone).
   * The copy's display name gains a "(copy)" suffix and it loses any marketplace origin.
   */
  async duplicateWorkflow(workflowName: string, newName?: string): Promise<Workflow> {
    const source = await this.getWorkflow(workflowName);
    if (!source) throw new Error(`Workflow "${workflowName}" not found`);

    let targetName = newName?.trim();
    if (!targetName) {
      targetName = `${workflowName}-copy`;
      for (let n = 2; await pathExists(this.resolveWorkflowPath(targetName)); n++) {
        targetName = `${workflowName}-copy${n}`;
      }
    }

    const { name: _name, updatedAt: _updatedAt, installedFrom: _installedFrom, ...item } = source;
    return this.createWorkflow(targetName, { ...item, displayName: `${source.displayName} (copy)` });
  }

  /**
   * Overwrites an existing workflow file. When the payload omits `installedFrom`, the file's
   * marketplace provenance is kept. A payload that sets it — a marketplace update, or an editor
   * draft that already has it — replaces the stamp.
   */
  async updateWorkflow(workflowName: string, workflow: WorkflowItemInput): Promise<Workflow> {
    const filePath = this.resolveWorkflowPath(workflowName);
    if (!(await pathExists(filePath))) {
      throw new Error(`Workflow "${workflowName}" not found`);
    }
    if (workflow.installedFrom === undefined) {
      const existing = await this.getWorkflow(workflowName);
      if (existing?.installedFrom) {
        return this.writeWorkflowFile(filePath, workflowName, { ...workflow, installedFrom: existing.installedFrom });
      }
    }
    return this.writeWorkflowFile(filePath, workflowName, workflow);
  }

  async deleteWorkflow(workflowName: string): Promise<boolean> {
    const filePath = this.resolveWorkflowPath(workflowName);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /** Every run this app has tracked, oldest first, including persisted and finished ones. */
  getRuns(): WorkflowRun[] {
    return this.app.getState(WorkflowState).runs;
  }

  /**
   * Cancels an in-flight run: cancels its agent job, which stops the step being run and every job
   * the run started (workflows its steps spawned, and so on). The run is recorded as cancelled at
   * once; the agent is kept for an hour so its transcript can be read, as for any cancelled job.
   * Returns false when the run does not exist or is already finished.
   */
  cancelRun(runId: string): boolean {
    const run = this.app.getState(WorkflowState).getRun(runId);
    if (!run || isRunFinished(run.status)) return false;

    this.finishRun(runId, "cancelled", "Run cancelled.");
    if (run.jobId) this.app.getService(AgentJobService)?.cancel(run.jobId, "Workflow run cancelled");
    return true;
  }

  /**
   * Starts a workflow run as an agent job (owner "workflow") and feeds the job's agent the steps in
   * the background. Returns as soon as the job's agent exists — the run's progress is followed
   * through state, not through this promise.
   *
   * With `startedBy` (a command or tool of an agent), the run is that agent's job's child: it counts
   * toward the job depth and fan-out limits and is cancelled with its parent. Otherwise a person
   * started it (UI / RPC) and it is a top-level job. Whether the job's agent may ask a person is the
   * engine's call (escalation configured or not), not the caller's.
   *
   * @throws ConfigurationError for an unknown workflow, agent type or a step that cannot be formatted
   *   (nothing is recorded); LimitError when the job limits refuse it (recorded as a failed run).
   */
  async spawnWorkflow(workflowName: string, options: StartRunOptions = {}): Promise<StartedRun> {
    const agentManager = this.app.requireService(AgentManager);
    const jobService = this.app.requireService(AgentJobService);

    const workflow = await this.getWorkflow(workflowName);
    if (!workflow) {
      throw new ConfigurationError(this.name, `Workflow "${workflowName}" not found.`);
    }
    if (!agentManager.getAgentConfig(workflow.agentType)) {
      throw new ConfigurationError(this.name, `Workflow "${workflowName}" uses agent type "${workflow.agentType}", which does not exist.`);
    }
    // Every step is formatted up front: a step the command parser would misread fails here, before anything runs.
    const messages = this.formatSteps(workflowName, workflow.steps);

    const run = this.app.mutateState(WorkflowState, state =>
      state.addRun({
        id: randomUUID(),
        workflowName,
        displayName: workflow.displayName,
        agentType: workflow.agentType,
        steps: workflow.steps,
        stepRecords: messages.map(label => ({ label, status: "pending" as const, startedAt: null, finishedAt: null, output: "" })),
        rerunOf: options.rerunOf ?? null,
      }),
    );
    this.persistRun(run.id);

    let session: JobSession;
    try {
      session = jobService.startJob({
        owner: "workflow",
        label: `${workflowName} run ${run.id}`,
        ownerRef: { run: run.id, workflow: workflowName },
        agentType: workflow.agentType,
        origin: options.startedBy
          ? { kind: "agent", agent: options.startedBy }
          : (options.origin ?? { kind: "person", label: options.personLabel ?? "Workflows app" }),
        // The whole run's time limit, from the workflow snapshot taken here; 0 → the engine's default.
        limits: { timeoutSeconds: workflow.subAgent.timeout > 0 ? workflow.subAgent.timeout : undefined, maxCostUsd: options.maxCostUsd },
        maxApprovalLevel: options.maxApprovalLevel,
      });
    } catch (error) {
      this.finishRun(run.id, "failed", `Could not start the run: ${formatError(error)}`);
      throw error;
    }

    this.updateRun(run.id, state => state.updateRun(run.id, { agentId: session.agent.id, jobId: session.id }));
    this.app.runBackgroundTask(this, signal => this.runWorkflowSteps(run.id, session, workflowName, messages, signal));

    return { runId: run.id, jobId: session.id, agent: session.agent };
  }

  /**
   * Starts a finished run's workflow again (the workflow as it is now), linked to the old run by
   * `rerunOf`. This is how an interrupted run is resumed: runs are never re-run automatically.
   */
  async rerunRun(runId: string, options: Omit<StartRunOptions, "rerunOf"> = {}): Promise<StartedRun> {
    const run = this.app.getState(WorkflowState).getRun(runId);
    if (!run) throw new ConfigurationError(this.name, `Workflow run ${runId} not found.`);
    if (!isRunFinished(run.status)) throw new ConfigurationError(this.name, `Workflow run ${runId} is still ${run.status}; cancel it first.`);
    return this.spawnWorkflow(run.workflowName, { ...options, rerunOf: run.id });
  }

  /** Each step's agent input, formatted against the live command registry. */
  private formatSteps(workflowName: string, steps: WorkflowStep[]): string[] {
    const commandService = this.app.getService(AgentCommandService);
    return steps.map((step, index) => {
      try {
        return formatWorkflowStep(step, commandService);
      } catch (error) {
        throw new ConfigurationError(
          this.name,
          `Workflow "${workflowName}" step ${index + 1} is invalid: ${Error.isError(error) ? error.message : String(error)}`,
        );
      }
    });
  }

  private resolveWorkflowPath(workflowName: string): string {
    assertValidName(workflowName);
    return path.join(this.getWorkflowDirectory(), `${workflowName}${EXTENSION}`);
  }

  /**
   * Runs the workflow's steps in the job's session, one `session.run` per step. A step's `retries`
   * re-run it after failures; `onError: "continue"` records the failure and keeps the run going (the
   * run then ends as `completedWithErrors`). The run stops at the first unhandled failure, or when
   * the job ends early: cancelled (here or by a parent job), over its time limit, or the app stopping.
   */
  private async runWorkflowSteps(runId: string, session: JobSession, workflowName: string, messages: string[], appSignal: AbortSignal): Promise<void> {
    const steps = this.app.getState(WorkflowState).getRun(runId)?.steps ?? [];
    const from = `Workflow ${workflowName}`;
    const ended = () => session.signal.aborted || appSignal.aborted;
    let failedSteps = 0;

    try {
      for (const [index, step] of steps.entries()) {
        if (ended()) {
          await this.endRunEarly(runId, session, appSignal, null);
          return;
        }

        this.updateRun(runId, state => state.startStep(runId, index));

        const options = stepExecutionOptions(step);
        const input = { from, message: messages[index] ?? "" };
        let result = await session.run(input, { signal: appSignal });
        let attempts = 1;
        while (result.status === "error" && attempts <= options.retries && !ended()) {
          result = await session.run(input, { signal: appSignal });
          attempts += 1;
        }

        if (result.status === "success") {
          const { message } = result;
          this.updateRun(runId, state => {
            state.endStep(runId, index, "done", attempts > 1 ? `[retried ${attempts - 1}x] ${message}` : message);
            state.updateRun(runId, { message });
          });
          continue;
        }

        if (ended()) {
          await this.endRunEarly(runId, session, appSignal, index);
          return;
        }
        const { message } = result;
        if (result.status === "cancelled") {
          // The agent itself cancelled the step (the job is still live).
          this.updateRun(runId, state => state.endStep(runId, index, "cancelled", message));
          await this.endRun(runId, session, "cancelled", message);
          return;
        }

        // The step failed (after any retries).
        this.updateRun(runId, state => state.endStep(runId, index, "failed", attempts > 1 ? `[${attempts} attempts] ${message}` : message));
        if (options.onError === "continue") {
          failedSteps += 1;
          this.updateRun(runId, state => state.updateRun(runId, { message: `Step ${index + 1} failed (continuing): ${message}` }));
          continue;
        }
        await this.endRun(runId, session, "failed", `Step ${index + 1} failed: ${message}`);
        return;
      }

      if (ended()) {
        await this.endRunEarly(runId, session, appSignal, null);
        return;
      }
      if (failedSteps > 0) {
        await this.endRun(
          runId,
          session,
          "completedWithErrors",
          `Workflow "${workflowName}" completed with ${failedSteps} failed step${failedSteps === 1 ? "" : "s"}`,
        );
      } else {
        await this.endRun(runId, session, "completed", `Workflow "${workflowName}" completed`);
      }
    } catch (error) {
      if (ended()) {
        await this.endRunEarly(runId, session, appSignal, null);
        return;
      }
      this.app.serviceError(this, `Workflow "${workflowName}" failed:`, error);
      await this.endRun(runId, session, "failed", formatError(error));
    }
  }

  /**
   * Records a run whose job ended before it did — cancelled (here or with a parent job), timed out or
   * over budget (failed), or the app stopping (interrupted) — taking the status and reason from the job.
   */
  private async endRunEarly(runId: string, session: JobSession, appSignal: AbortSignal, stepIndex: number | null): Promise<void> {
    const job = session.record;
    const ended = session.ended;
    const status: WorkflowRunStatus =
      ended === "shutdown" || (appSignal.aborted && !ended) ? "interrupted" : ended === "timeout" || ended === "budget" ? "failed" : "cancelled";
    const message =
      status === "interrupted"
        ? "Interrupted: the app stopped while the run was in flight. Use Run again to start it again."
        : status === "failed"
          ? `Workflow stopped: ${job.error ?? "the job failed"}`
          : `Workflow cancelled: ${job.error ?? "cancelled"}`;
    if (stepIndex !== null) this.updateRun(runId, state => state.endStep(runId, stepIndex, status === "failed" ? "failed" : "cancelled", message));
    await this.endRun(runId, session, status, message);
  }

  /** Ends the job (its agent is deleted on success, an hour later otherwise), then the run, with the job's cost. */
  private async endRun(runId: string, session: JobSession, status: WorkflowRunStatus, message: string): Promise<void> {
    // completedWithErrors ends the job as failed, so the agent is kept for an hour to inspect the failed steps.
    const jobStatus = status === "completed" ? "succeeded" : status === "cancelled" || status === "interrupted" ? "cancelled" : "failed";
    let costUsd: number | null = null;
    try {
      costUsd = (await session.finish(jobStatus, truncateRunText(message))).costUsd;
    } catch (error) {
      this.app.serviceError(this, `Could not finish the job of workflow run ${runId}:`, error);
    }
    this.app.mutateState(WorkflowState, state => {
      state.finishRun(runId, status, message);
      state.updateRun(runId, { costUsd });
    });
    this.persistRun(runId);
  }

  /** Mutates run state through `mutate` and persists the resulting snapshot to disk. */
  private updateRun(runId: string, mutate: (state: WorkflowState) => void): void {
    this.app.mutateState(WorkflowState, state => mutate(state));
    this.persistRun(runId);
  }

  private finishRun(runId: string, status: WorkflowRun["status"], message: string): void {
    this.app.mutateState(WorkflowState, state => state.finishRun(runId, status, message));
    this.persistRun(runId);
  }

  // ─── Run persistence ─────────────────────────────────────────────────────────

  /**
   * Serializes ALL persistence through one queue: a run's snapshot is read fresh
   * inside its queued task, and every finished-run write is followed by a prune,
   * so the last task always reflects the final state. Best-effort: failures are
   * logged, never thrown.
   */
  private persistQueue: Promise<void> = Promise.resolve();

  private persistRun(runId: string): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        const run = this.app.getState(WorkflowState).getRun(runId);
        if (!run) return;
        await fs.mkdir(this.getRunsDirectory(), { recursive: true });
        await fs.writeFile(path.join(this.getRunsDirectory(), `${runId}.json`), JSON.stringify(run, null, 2));
        if (isRunFinished(run.status)) await this.prunePersistedRuns();
      })
      .catch((error: unknown) => {
        console.error(`Unable to persist workflow run ${runId}: ${formatError(error)}`);
      });
  }

  /** Resolves once every run record write (and history load) queued so far is done. */
  async flush(): Promise<void> {
    await this.persistQueue;
  }

  /** Deletes persisted run records that state no longer keeps, so disk mirrors memory exactly. */
  private async prunePersistedRuns(): Promise<void> {
    const runsDirectory = this.getRunsDirectory();
    let entries: string[];
    try {
      entries = await fs.readdir(runsDirectory);
    } catch {
      return;
    }

    const kept = new Set(this.app.getState(WorkflowState).runs.map(run => run.id));
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const runId = entry.slice(0, -".json".length);
      if (!kept.has(runId)) {
        await fs.rm(path.join(runsDirectory, entry), { force: true }).catch(() => {});
      }
    }
  }

  private async readWorkflowFile(filePath: string, workflowName: string): Promise<Workflow | null> {
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }

    const parsed = YAML.parse(await fs.readFile(filePath, "utf-8"));
    const item = WorkflowItemSchema.parse(parsed ?? {});
    return { ...item, name: workflowName, updatedAt: stat.mtime.toISOString() };
  }

  private async writeWorkflowFile(filePath: string, workflowName: string, workflow: WorkflowItemInput): Promise<Workflow> {
    const item = WorkflowItemSchema.parse(workflow);
    writeYamlAtomic(filePath, item, FILE_HEADER);
    const stat = await fs.stat(filePath);
    return { ...item, name: workflowName, updatedAt: stat.mtime.toISOString() };
  }
}
