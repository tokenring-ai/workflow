import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type Agent, AgentManager } from "@tokenring-ai/agent";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import writeYamlAtomic from "@tokenring-ai/app/config/writeYamlAtomic";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { ConfigurationError } from "@tokenring-ai/app/types";
import formatError from "@tokenring-ai/utility/error/formatError";
import { YAML } from "bun";
import { type ParsedWorkflowConfig, type Workflow, type WorkflowItemInput, WorkflowItemSchema, type WorkflowRun } from "./schema.ts";
import { WorkflowState } from "./state/workflowState.ts";

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const EXTENSION = ".yaml";

/** How many finished runs are kept in state for the UI's history. */
const MAX_FINISHED_RUNS = 50;

const FILE_HEADER = "# TokenRing workflow definition. The file name is the workflow name.";

function assertValidName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid workflow name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`,
    );
  }
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * Manages multi-step agent workflows stored as YAML files on disk, and runs them.
 *
 * Layout: `<workflowDirectory>/<name>.yaml`
 *
 * Running a workflow spawns an agent of the workflow's agent type and feeds it one step at a time,
 * recording progress in {@link WorkflowState} so the UI can follow the run.
 */
export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  description = "Manages multi-step agent workflows, backed by YAML files on disk";

  constructor(
    private app: TokenRingApp,
    private config: ParsedWorkflowConfig,
  ) {
    this.app.stateManager.initializeState(WorkflowState, MAX_FINISHED_RUNS);
  }

  reconfigure(newConfig: ParsedWorkflowConfig): void {
    this.config = newConfig;
  }

  getWorkflowDirectory(): string {
    return this.config.workflowDirectory;
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
    } catch {
      return [];
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
    if (await pathExists(filePath)) {
      throw new Error(`Workflow "${workflowName}" already exists`);
    }
    return this.writeWorkflowFile(filePath, workflowName, workflow);
  }

  async updateWorkflow(workflowName: string, workflow: WorkflowItemInput): Promise<Workflow> {
    const filePath = this.resolveWorkflowPath(workflowName);
    if (!(await pathExists(filePath))) {
      throw new Error(`Workflow "${workflowName}" not found`);
    }
    return this.writeWorkflowFile(filePath, workflowName, workflow);
  }

  async deleteWorkflow(workflowName: string): Promise<boolean> {
    const filePath = this.resolveWorkflowPath(workflowName);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Every run this app has tracked, oldest first, including finished ones. */
  getRuns(): WorkflowRun[] {
    return this.app.stateManager.getState(WorkflowState).runs;
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

    const run = this.app.stateManager.mutateState(WorkflowState, state =>
      state.addRun({
        id: randomUUID(),
        workflowName,
        displayName: workflow.displayName,
        agentType: workflow.agentType,
        steps: workflow.steps,
      }),
    );

    let agent: Agent;
    try {
      agent = agentManager.spawnAgent({ agentType: workflow.agentType, headless });
    } catch (error) {
      this.finishRun(run.id, "failed", formatError(error));
      throw error;
    }

    this.app.stateManager.mutateState(WorkflowState, state => state.updateRun(run.id, { agentId: agent.id }));

    this.app.runBackgroundTask(this, signal => this.runWorkflowSteps(run.id, agent, workflowName, signal));

    return agent;
  }

  private resolveWorkflowPath(workflowName: string): string {
    assertValidName(workflowName);
    return path.join(this.getWorkflowDirectory(), `${workflowName}${EXTENSION}`);
  }

  /**
   * Runs the workflow's steps on `agent`, one at a time, waiting for each step's response before
   * sending the next and stopping at the first step that does not succeed.
   */
  private async runWorkflowSteps(runId: string, agent: Agent, workflowName: string, appSignal: AbortSignal): Promise<void> {
    const signal = AbortSignal.any([appSignal, agent.agentShutdownSignal]);
    const steps = this.app.stateManager.getState(WorkflowState).getRun(runId)?.steps ?? [];
    const from = `Workflow ${workflowName}`;

    try {
      await agent.waitForState(AgentEventState, state => state.idle);

      for (const [index, step] of steps.entries()) {
        if (signal.aborted) {
          this.finishRun(runId, "cancelled", "Workflow was aborted.");
          return;
        }

        this.app.stateManager.mutateState(WorkflowState, state => state.updateRun(runId, { currentStep: index, status: "running" }));

        const result = await this.runStep(agent, step, from, signal);
        this.app.stateManager.mutateState(WorkflowState, state => state.updateRun(runId, { message: result.message }));

        if (result.status !== "success") {
          this.finishRun(runId, result.status === "cancelled" ? "cancelled" : "failed", result.message);
          return;
        }
      }

      this.finishRun(runId, "completed", `Workflow "${workflowName}" completed`);
    } catch (error) {
      this.app.serviceError(this, `Workflow "${workflowName}" failed:`, error);
      this.finishRun(runId, "failed", formatError(error));
    }
  }

  /** Sends a single step to the agent and resolves with the agent's response to that step. */
  private async runStep(
    agent: Agent,
    step: string,
    from: string,
    signal: AbortSignal,
  ): Promise<{ status: "success" | "error" | "cancelled"; message: string }> {
    const cursor = agent.getState(AgentEventState).getEventCursorFromCurrentPosition();
    const requestId = agent.handleInput({ from, message: step });

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      for (const event of state.yieldEventsByCursor(cursor)) {
        if (event.type === "agent.response" && event.requestId === requestId) {
          return { status: event.status, message: event.message };
        }
      }
    }

    return { status: "cancelled", message: "Agent stopped before the step completed." };
  }

  private finishRun(runId: string, status: WorkflowRun["status"], message: string): void {
    this.app.stateManager.mutateState(WorkflowState, state => state.finishRun(runId, status, message));
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
