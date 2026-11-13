import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type Agent, AgentCommandService, AgentManager } from "@tokenring-ai/agent";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import writeYamlAtomic from "@tokenring-ai/app/config/writeYamlAtomic";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { ConfigurationError } from "@tokenring-ai/app/types";
import formatError from "@tokenring-ai/utility/error/formatError";
import { YAML } from "bun";
import type { z } from "zod";
import { formatWorkflowStep, formatWorkflowStepLabel } from "./formatWorkflowStep.ts";
import {
  type ParsedWorkflowConfig,
  type Workflow,
  type WorkflowItemInput,
  WorkflowItemSchema,
  type WorkflowRun,
  WorkflowRunSchema,
  type WorkflowRunStep,
  WorkflowServiceConfigSchema,
  type WorkflowStep,
} from "./schema.ts";
import { isRunFinished, WorkflowState } from "./state/workflowState.ts";

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const EXTENSION = ".yaml";
const RUNS_DIRECTORY = ".runs";

/** Longest step output kept in a run record; full responses still live in the agent's history. */
const MAX_STEP_OUTPUT_CHARS = 4000;

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

function truncateOutput(message: string): string {
  return message.length > MAX_STEP_OUTPUT_CHARS ? `${message.slice(0, MAX_STEP_OUTPUT_CHARS)}…` : message;
}

/**
 * Reads the signal's current abort state.
 *
 * Deliberately indirect: a bare `signal.aborted` read is narrowed to `false` by
 * an earlier `if (signal.aborted)` check for the rest of the block, even though
 * the awaits in between can abort the signal. Going through a function keeps
 * every check a live runtime read.
 */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Per-step execution options. Structured steps carry their own; plain-string
 * steps use these defaults.
 */
function stepExecutionOptions(step: WorkflowStep): { onError: "stop" | "continue"; retries: number } {
  return typeof step === "string" ? { onError: "stop", retries: 0 } : { onError: step.onError ?? "stop", retries: step.retries ?? 0 };
}

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

  /** Abort controllers for in-flight runs, keyed by run id. */
  private readonly runAbortControllers = new Map<string, AbortController>();

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
   * restarts. Runs that were still in flight when the process died are recorded as cancelled.
   * Missing directory is normal (nothing has run yet); other read errors are logged, not fatal.
   */
  async loadRunHistory(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.getRunsDirectory());
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      console.error(`Unable to read workflow run history: ${formatError(error)}`);
      return;
    }

    const runs: WorkflowRun[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const parsed = WorkflowRunSchema.parse(JSON.parse(await fs.readFile(path.join(this.getRunsDirectory(), entry), "utf8")));
        runs.push(
          isRunFinished(parsed.status) ? parsed : { ...parsed, status: "cancelled", message: "Interrupted by an application restart", finishedAt: Date.now() },
        );
      } catch (error) {
        console.error(`Skipping invalid workflow run record ${entry}: ${formatError(error)}`);
      }
    }

    runs.sort((a, b) => a.startedAt - b.startedAt);
    this.app.mutateState(WorkflowState, state => {
      state.runs = [...state.runs, ...runs];
      state.trimFinishedRuns();
    });
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
   * Cancels an in-flight run: aborts its step loop and terminates the run's agent.
   * Returns false when the run does not exist or is already finished.
   */
  cancelRun(runId: string): boolean {
    const run = this.app.getState(WorkflowState).getRun(runId);
    if (!run || isRunFinished(run.status)) return false;

    this.runAbortControllers.get(runId)?.abort();
    if (run.agentId) {
      this.app.requireService(AgentManager).deleteAgent(run.agentId, `Workflow run cancelled`);
    }
    if (run.status === "starting") {
      // The step loop may not have started yet; record the outcome now (the loop's
      // abort check sees the finished run and exits without double-finishing).
      this.finishRun(runId, "cancelled", "Run cancelled.");
    }
    return true;
  }

  /**
   * Spawns an agent of the workflow's agent type, registers the run in {@link WorkflowState}, and
   * starts feeding the agent its steps in the background. Returns as soon as the agent exists — the
   * run's progress is followed through state, not through this promise.
   */
  async spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Promise<Agent> {
    const agentManager = this.app.requireService(AgentManager);

    const workflow = await this.getWorkflow(workflowName);
    if (!workflow) {
      throw new ConfigurationError(this.name, `Workflow "${workflowName}" not found.`);
    }
    if (!agentManager.getAgentConfig(workflow.agentType)) {
      throw new ConfigurationError(this.name, `Workflow "${workflowName}" uses agent type "${workflow.agentType}", which does not exist.`);
    }

    const run = this.app.mutateState(WorkflowState, state =>
      state.addRun({
        id: randomUUID(),
        workflowName,
        displayName: workflow.displayName,
        agentType: workflow.agentType,
        steps: workflow.steps,
        stepRecords: this.buildStepRecords(workflow.steps),
      }),
    );
    this.persistRun(run.id);

    let agent: Agent;
    try {
      agent = agentManager.spawnAgent({ agentType: workflow.agentType, headless });
    } catch (error) {
      this.finishRun(run.id, "failed", formatError(error));
      throw error;
    }

    this.app.mutateState(WorkflowState, state => state.updateRun(run.id, { agentId: agent.id }));

    const controller = new AbortController();
    this.runAbortControllers.set(run.id, controller);
    // The timeout comes from the workflow snapshot taken at spawn; the run never re-reads the file.
    const timeoutSeconds = workflow.subAgent.timeout > 0 ? workflow.subAgent.timeout : null;
    this.app.runBackgroundTask(this, signal => this.runWorkflowSteps(run.id, agent, workflowName, signal, controller, timeoutSeconds));

    return agent;
  }

  /** Per-run step records with human-readable labels formatted against the live command registry. */
  private buildStepRecords(steps: WorkflowStep[]): WorkflowRunStep[] {
    const commandService = this.app.getService(AgentCommandService);
    return steps.map(step => {
      let label: string;
      try {
        label = commandService ? formatWorkflowStep(step, commandService) : formatWorkflowStepLabel(step);
      } catch {
        label = formatWorkflowStepLabel(step);
      }
      return { label, status: "pending" as const, startedAt: null, finishedAt: null, output: "" };
    });
  }

  private resolveWorkflowPath(workflowName: string): string {
    assertValidName(workflowName);
    return path.join(this.getWorkflowDirectory(), `${workflowName}${EXTENSION}`);
  }

  /**
   * Runs the workflow's steps on `agent`, one at a time, waiting for each step's response before
   * sending the next. A step's `retries` re-run it after failures; `onError: "continue"` records
   * the failure and keeps the run going. The run stops at the first unhandled failure, on
   * cancellation (abort or agent shutdown), or when the configured timeout elapses.
   */
  private async runWorkflowSteps(
    runId: string,
    agent: Agent,
    workflowName: string,
    appSignal: AbortSignal,
    controller: AbortController,
    timeoutSeconds: number | null,
  ): Promise<void> {
    const timeoutMs = timeoutSeconds !== null ? timeoutSeconds * 1000 : null;
    const timeoutSignal = timeoutMs !== null ? AbortSignal.timeout(timeoutMs) : undefined;
    const signals: AbortSignal[] = [appSignal, agent.agentShutdownSignal, controller.signal];
    if (timeoutSignal) signals.push(timeoutSignal);
    const signal = AbortSignal.any(signals);
    const steps = this.app.getState(WorkflowState).getRun(runId)?.steps ?? [];
    const from = `Workflow ${workflowName}`;

    try {
      await agent.waitForState(AgentEventState, state => state.idle, signal);

      for (const [index, step] of steps.entries()) {
        if (isAborted(signal)) {
          this.finishRun(runId, this.abortRunStatus(signal), this.abortRunMessage(signal, timeoutMs));
          return;
        }

        this.updateRun(runId, state => state.startStep(runId, index));

        const options = stepExecutionOptions(step);
        let result = await this.runStep(agent, step, from, signal);
        let attempts = 1;
        while (result.status === "error" && attempts <= options.retries && !isAborted(signal)) {
          result = await this.runStep(agent, step, from, signal);
          attempts += 1;
        }

        if (result.status === "success") {
          this.updateRun(runId, state =>
            state.endStep(runId, index, "done", attempts > 1 ? `[retried ${attempts - 1}x] ${truncateOutput(result.message)}` : truncateOutput(result.message)),
          );
          this.updateRun(runId, state => state.updateRun(runId, { message: result.message }));
          continue;
        }

        if (result.status === "cancelled" || isAborted(signal)) {
          this.updateRun(runId, state => state.endStep(runId, index, "cancelled", truncateOutput(result.message)));
          this.finishRun(runId, "cancelled", result.message);
          return;
        }

        // The step failed (after any retries).
        this.updateRun(runId, state =>
          state.endStep(runId, index, "failed", attempts > 1 ? `[${attempts} attempts] ${truncateOutput(result.message)}` : truncateOutput(result.message)),
        );
        if (options.onError === "continue") {
          this.updateRun(runId, state => state.updateRun(runId, { message: `Step ${index + 1} failed (continuing): ${result.message}` }));
          continue;
        }
        this.finishRun(runId, "failed", `Step ${index + 1} failed: ${result.message}`);
        return;
      }

      if (isAborted(signal)) {
        this.finishRun(runId, this.abortRunStatus(signal), this.abortRunMessage(signal, timeoutMs));
        return;
      }
      this.finishRun(runId, "completed", `Workflow "${workflowName}" completed`);
    } catch (error) {
      this.app.serviceError(this, `Workflow "${workflowName}" failed:`, error);
      this.finishRun(runId, "failed", formatError(error));
    } finally {
      this.runAbortControllers.delete(runId);
    }
  }

  /** How to record a run that ended because its signal aborted. */
  private abortRunStatus(signal: AbortSignal): WorkflowRun["status"] {
    return signal.reason?.name === "TimeoutError" ? "failed" : "cancelled";
  }

  private abortRunMessage(signal: AbortSignal, timeoutSeconds: number | null): string {
    if (signal.reason?.name === "TimeoutError") {
      return `Workflow timed out after ${timeoutSeconds ?? 0} seconds.`;
    }
    return "Workflow was aborted.";
  }

  /** Sends a single step to the agent and resolves with the agent's response to that step. */
  private async runStep(
    agent: Agent,
    step: WorkflowStep,
    from: string,
    signal: AbortSignal,
  ): Promise<{ status: "success" | "error" | "cancelled"; message: string }> {
    const commandService = this.app.getService(AgentCommandService);
    const message = formatWorkflowStep(step, commandService);
    const cursor = agent.getState(AgentEventState).getEventCursorFromCurrentPosition();
    const requestId = agent.handleInput({ from, message });

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      for (const event of state.yieldEventsByCursor(cursor)) {
        if (event.type === "agent.response" && event.requestId === requestId) {
          return { status: event.status, message: event.message };
        }
      }
    }

    return { status: "cancelled", message: "Agent stopped before the step completed." };
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
