import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Agent, AgentCommandService, AgentJobService, AgentManager } from "@tokenring-ai/agent";
import { AgentConfigSchema, AgentJobsConfigSchema } from "@tokenring-ai/agent/schema";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { YAML } from "bun";
import { MAX_STEP_OUTPUT_CHARS, MAX_STEP_RETRIES } from "./schema.ts";
import { isRunFinished, WorkflowState } from "./state/workflowState.ts";
import WorkflowService from "./WorkflowService.ts";

describe("WorkflowService", () => {
  const tempDirs: string[] = [];
  const app: TokenRingApp = createTestingApp();

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-workflow-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeService(workflowDirectory: string): WorkflowService {
    const service = new WorkflowService(app);
    service.reconfigure({ maxFinishedRuns: 50, workflowDirectory });
    return service;
  }

  const sampleWorkflow = {
    displayName: "Bug Hunter",
    category: "Code Review",
    description: "Finds and fixes bugs",
    agentType: "leader",
    steps: [
      "Find every package in the monorepo",
      {
        command: "agent run",
        arguments: { type: "code-quality-engineer" },
        remainder: "Fix bugs in the packages",
      },
    ],
  };

  test("listWorkflows returns an empty array when the directory doesn't exist", async () => {
    const service = makeService(path.join(tempDir(), "missing"));
    expect(await service.listWorkflows()).toEqual([]);
  });

  test("createWorkflow writes a YAML file named after the workflow", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    const created = await service.createWorkflow("bugHunter", sampleWorkflow);
    expect(created).toMatchObject({ name: "bugHunter", displayName: "Bug Hunter", category: "Code Review", steps: sampleWorkflow.steps });
    expect(created.subAgent.forwardStatusMessages).toBe(true);

    const filePath = path.join(dir, "bugHunter.yaml");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(YAML.parse(fs.readFileSync(filePath, "utf-8"))).toMatchObject({ displayName: "Bug Hunter", agentType: "leader" });
  });

  test("createWorkflow throws when the workflow already exists", async () => {
    const service = makeService(tempDir());
    await service.createWorkflow("dup", sampleWorkflow);
    await expect(service.createWorkflow("dup", sampleWorkflow)).rejects.toThrow('Workflow "dup" already exists');
  });

  test("createWorkflow rejects invalid names", async () => {
    const service = makeService(tempDir());
    await expect(service.createWorkflow("../escape", sampleWorkflow)).rejects.toThrow("Invalid workflow name");
  });

  test("getWorkflow reads a workflow back, applying schema defaults", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    fs.writeFileSync(path.join(dir, "minimal.yaml"), "displayName: Minimal\nagentType: leader\n");

    const workflow = await service.getWorkflow("minimal");
    expect(workflow).toMatchObject({
      name: "minimal",
      displayName: "Minimal",
      agentType: "leader",
      category: "User-Created Workflows",
      description: "",
      steps: [],
    });
    expect(workflow?.subAgent.maxResponseLength).toBe(10000);
  });

  test("getWorkflow returns null for a missing workflow", async () => {
    const service = makeService(tempDir());
    expect(await service.getWorkflow("nope")).toBeNull();
  });

  test("updateWorkflow overwrites an existing workflow", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    await service.createWorkflow("bugHunter", sampleWorkflow);

    const updated = await service.updateWorkflow("bugHunter", { ...sampleWorkflow, displayName: "Renamed", steps: ["one"] });
    expect(updated).toMatchObject({ name: "bugHunter", displayName: "Renamed", steps: ["one"] });
    expect(updated.installedFrom).toBeUndefined();
    expect((await service.getWorkflow("bugHunter"))?.displayName).toBe("Renamed");
  });

  test("updateWorkflow keeps installedFrom when a marketplace workflow is saved without it", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    const installedFrom = {
      registry: "tokenring-ai/community",
      id: "workflow/testing/bug-hunter",
      version: "1.0.0",
      author: "TokenRing Core",
      installedAt: "2026-01-01T00:00:00.000Z",
    };
    await service.createWorkflow("bugHunter", { ...sampleWorkflow, installedFrom });

    const updated = await service.updateWorkflow("bugHunter", { ...sampleWorkflow, displayName: "Renamed" });
    expect(updated.installedFrom).toEqual(installedFrom);
    expect((await service.getWorkflow("bugHunter"))?.installedFrom).toEqual(installedFrom);
    expect((YAML.parse(fs.readFileSync(path.join(dir, "bugHunter.yaml"), "utf-8")) as { installedFrom?: unknown }).installedFrom).toEqual(installedFrom);

    // A payload that carries its own stamp (marketplace update, or an editor round-trip) replaces it.
    const replacedFrom = { ...installedFrom, version: "1.2.0", installedAt: "2026-02-01T00:00:00.000Z" };
    const replaced = await service.updateWorkflow("bugHunter", { ...sampleWorkflow, installedFrom: replacedFrom });
    expect(replaced.installedFrom).toEqual(replacedFrom);
    expect((await service.getWorkflow("bugHunter"))?.installedFrom).toEqual(replacedFrom);
  });

  test("updateWorkflow throws when the workflow does not exist", async () => {
    const service = makeService(tempDir());
    await expect(service.updateWorkflow("ghost", sampleWorkflow)).rejects.toThrow('Workflow "ghost" not found');
  });

  test("listWorkflows returns every valid workflow sorted by name, skipping unparseable files", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    await service.createWorkflow("zeta", sampleWorkflow);
    await service.createWorkflow("alpha", sampleWorkflow);
    fs.writeFileSync(path.join(dir, "broken.yaml"), "displayName: Missing agent type\n");
    fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");

    const workflows = await service.listWorkflows();
    expect(workflows.map(w => w.name)).toEqual(["alpha", "zeta"]);
  });

  test("createWorkflow rejects names reserved by the dashboard routes", async () => {
    const service = makeService(tempDir());
    await expect(service.createWorkflow("new", sampleWorkflow)).rejects.toThrow("reserved");
    await expect(service.createWorkflow("Marketplace", sampleWorkflow)).rejects.toThrow("reserved");
  });

  test("exportWorkflow round-trips through importWorkflow, carrying the name hint", async () => {
    const service = makeService(tempDir());
    await service.createWorkflow("bugHunter", {
      ...sampleWorkflow,
      steps: [{ command: "agent run", arguments: {}, remainder: "go", onError: "continue", retries: 2 }],
      installedFrom: { registry: "tokenring-ai/community", id: "workflow/x", installedAt: "2026-01-01T00:00:00.000Z" },
    });

    const exported = await service.exportWorkflow("bugHunter");
    expect(exported.fileName).toBe("bugHunter.yaml");
    expect(exported.yaml.startsWith("# TokenRing workflow export")).toBe(true);
    const parsed = YAML.parse(exported.yaml) as Record<string, unknown>;
    expect(parsed.name).toBe("bugHunter");
    expect(parsed.installedFrom).toBeUndefined();
    expect(parsed.updatedAt).toBeUndefined();

    // Name taken → refused; explicit new name → created with the same body.
    await expect(service.importWorkflow(exported.yaml)).rejects.toThrow('Workflow "bugHunter" already exists');
    const imported = await service.importWorkflow(exported.yaml, "bugHunter2");
    expect(imported).toMatchObject({ name: "bugHunter2", displayName: "Bug Hunter", agentType: "leader" });
    expect(imported.steps).toEqual([{ command: "agent run", arguments: {}, remainder: "go", onError: "continue", retries: 2 }]);
    expect(imported.installedFrom).toBeUndefined();
  });

  test("importWorkflow validates the YAML and requires a name", async () => {
    const service = makeService(tempDir());
    await expect(service.importWorkflow("displayName: [unclosed", "x")).rejects.toThrow("Not valid YAML");
    await expect(service.importWorkflow("- a\n- b\n", "x")).rejects.toThrow("must be a YAML mapping");
    await expect(service.importWorkflow("displayName: X\nagentType: leader\n")).rejects.toThrow("no `name`");
    await expect(service.importWorkflow("displayName: X\n", "x")).rejects.toThrow(/Invalid workflow file: agentType/);
    await expect(service.importWorkflow("displayName: X\nagentType: leader\nsteps:\n  - retries: -1\n", "x")).rejects.toThrow("Invalid workflow file");
    await expect(service.importWorkflow("displayName: X\nagentType: leader\n", "new")).rejects.toThrow("reserved");
    expect(await service.listWorkflows()).toEqual([]);
  });

  test("duplicateWorkflow picks the next free copy name and marks the display name", async () => {
    const service = makeService(tempDir());
    await service.createWorkflow("bugHunter", sampleWorkflow);

    const first = await service.duplicateWorkflow("bugHunter");
    expect(first).toMatchObject({ name: "bugHunter-copy", displayName: "Bug Hunter (copy)", steps: sampleWorkflow.steps });
    const second = await service.duplicateWorkflow("bugHunter");
    expect(second.name).toBe("bugHunter-copy2");
    const named = await service.duplicateWorkflow("bugHunter", "hunter3");
    expect(named.name).toBe("hunter3");

    await expect(service.duplicateWorkflow("bugHunter", "hunter3")).rejects.toThrow("already exists");
    await expect(service.duplicateWorkflow("missing")).rejects.toThrow('Workflow "missing" not found');
  });

  test("deleteWorkflow removes the file and reports whether it existed", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    await service.createWorkflow("bugHunter", sampleWorkflow);

    expect(await service.deleteWorkflow("bugHunter")).toBe(true);
    expect(fs.existsSync(path.join(dir, "bugHunter.yaml"))).toBe(false);
    expect(await service.deleteWorkflow("bugHunter")).toBe(false);
  });

  test("workflows round-trip structured steps through YAML", async () => {
    const service = makeService(tempDir());
    await service.createWorkflow("structured", sampleWorkflow);
    const loaded = await service.getWorkflow("structured");
    expect(loaded?.steps).toEqual([
      "Find every package in the monorepo",
      {
        command: "agent run",
        arguments: { type: "code-quality-engineer" },
        remainder: "Fix bugs in the packages",
      },
    ]);
  });
});

describe("WorkflowService run tracking", () => {
  const tempDirs: string[] = [];
  const jobServices: AgentJobService[] = [];
  const workflowServices: WorkflowService[] = [];

  afterEach(async () => {
    for (const jobs of jobServices.splice(0)) {
      jobs.stop();
      await jobs.flush();
    }
    // Let runs ended by the stop record themselves before their directory goes.
    await new Promise(resolve => setTimeout(resolve, 20));
    for (const service of workflowServices.splice(0)) await service.flush();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  const agentConfig = AgentConfigSchema.parse({
    agentType: "leader",
    displayName: "Leader",
    description: "An agent used to run workflows in tests",
    category: "test",
  });

  /** A fresh app with an AgentManager that knows about the `leader` agent type, and the job engine. */
  function makeApp(jobsConfig: Record<string, unknown> = {}) {
    const app = createTestingApp();
    const agentManager = new AgentManager(app);
    agentManager.addAgentConfigs(agentConfig);
    app.addService(AgentManager, agentManager);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-workflow-"));
    tempDirs.push(dir);

    const jobs = app.addService(
      AgentJobService,
      new AgentJobService(app, { recordsFile: path.join(dir, "agent-jobs.json"), config: AgentJobsConfigSchema.parse(jobsConfig), keepFailedAgentMs: 60_000 }),
    );
    jobServices.push(jobs);

    const service = new WorkflowService(app);
    service.reconfigure({ maxFinishedRuns: 50, workflowDirectory: path.join(dir, "workflows") });
    app.addService(WorkflowService, service);
    workflowServices.push(service);
    return { app, service, jobs, agentManager };
  }

  type Outcome = { status: "success" | "error" | "cancelled"; message: string };

  /**
   * Stands in for the agent's command loop: answers every input the workflow sends with the outcome
   * `respond` returns (null: never answers), recording the step messages it saw.
   */
  function respondToSteps(agent: Agent, respond: (message: string) => Outcome | null | Promise<Outcome | null>): string[] {
    const executed: string[] = [];
    // From the start: the run may have sent its first step before the test attaches.
    const cursor = { position: 0 };
    const answered = new Set<string>();

    void (async () => {
      for await (const state of agent.subscribeStateAsync(AgentEventState, agent.agentShutdownSignal)) {
        const pending = [];
        for (const event of state.yieldEventsByCursor(cursor)) {
          if (event.type === "input.received" && !answered.has(event.requestId)) {
            answered.add(event.requestId);
            pending.push(event);
          }
        }
        for (const event of pending) {
          executed.push(event.input.message);
          void Promise.resolve(respond(event.input.message)).then(outcome => {
            if (!outcome || agent.agentShutdownSignal.aborted) return;
            agent.mutateState(AgentEventState, eventState => {
              eventState.emit({ type: "agent.response", requestId: event.requestId, status: outcome.status, message: outcome.message, timestamp: Date.now() });
              eventState.emit({ type: "input.execution", requestId: event.requestId, status: "finished", timestamp: Date.now() });
            });
          });
        }
      }
    })();

    return executed;
  }

  const succeed = (message: string): Outcome => ({ status: "success", message: `ran ${message}` });

  function waitForFinishedRuns(app: TokenRingApp, count = 1): Promise<Readonly<WorkflowState>> {
    return app.timedWaitForState(
      WorkflowState,
      state => state.runs.length >= count && state.runs.every(run => isRunFinished(run.status)),
      5000,
      new AbortController().signal,
    );
  }

  /** Polls `condition` (sync or async) until truthy. */
  async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await condition()) return;
      if (Date.now() > deadline) throw new Error("waitFor: condition never became true");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  async function waitForFile(filePath: string, timeoutMs = 3000): Promise<void> {
    await waitFor(() => fs.existsSync(filePath), timeoutMs);
  }

  test("spawnWorkflow runs every step in an agent job, then deletes the agent", async () => {
    const { app, service, jobs, agentManager } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1", "step2"] });

    const started = await service.spawnWorkflow("wf");
    const executed = respondToSteps(started.agent, succeed);

    const state = await waitForFinishedRuns(app);

    expect(executed).toEqual(["step1", "step2"]);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toMatchObject({
      id: started.runId,
      workflowName: "wf",
      displayName: "WF",
      agentType: "leader",
      agentId: started.agent.id,
      jobId: started.jobId,
      steps: ["step1", "step2"],
      currentStep: 2,
      status: "completed",
    });
    expect(jobs.get(started.jobId)).toMatchObject({
      owner: "workflow",
      label: `wf run ${started.runId}`,
      status: "succeeded",
      origin: { kind: "person" },
      ownerRef: { run: started.runId, workflow: "wf" },
    });
    // The engine deletes a succeeded job's agent: runs no longer leak agents.
    expect(agentManager.getAgent(started.agent.id)).toBeFalsy();
  });

  test("spawnWorkflow passes a budget and approval allowance to the run's job", async () => {
    const { service, jobs } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });
    const started = await service.spawnWorkflow("wf", { maxCostUsd: 2, maxApprovalLevel: 3 });
    expect(jobs.get(started.jobId)).toMatchObject({ maxCostUsd: 2, approvalLevel: 3 });
    jobs.cancel(started.jobId, "test over");
  });

  test("structured command steps are formatted into agent messages when run", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", {
      displayName: "WF",
      agentType: "leader",
      steps: [
        "plain chat",
        {
          command: "agent run",
          arguments: { type: "leader", bg: true },
          remainder: "do work",
        },
      ],
    });

    const { agent } = await service.spawnWorkflow("wf");
    const executed = respondToSteps(agent, succeed);
    await waitForFinishedRuns(app);

    expect(executed).toEqual(["plain chat", "/agent run --type leader --bg do work"]);
  });

  test("a failing step stops the run and records where it stopped", async () => {
    const { app, service, jobs } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1", "step2", "step3"] });

    const started = await service.spawnWorkflow("wf");
    const executed = respondToSteps(started.agent, message => (message === "step2" ? { status: "error", message: "step2 blew up" } : succeed(message)));

    const state = await waitForFinishedRuns(app);

    expect(executed).toEqual(["step1", "step2"]);
    expect(state.runs[0]).toMatchObject({ currentStep: 1, status: "failed", message: "Step 2 failed: step2 blew up" });
    // Per-step records capture what each step did.
    const records = state.runs[0]?.stepRecords ?? [];
    expect(records.map(record => record.status)).toEqual(["done", "failed", "pending"]);
    expect(records[0]).toMatchObject({ label: "step1", output: "ran step1" });
    expect(records[1]?.output).toContain("step2 blew up");
    expect(jobs.get(started.jobId)?.status).toBe("failed");
  });

  test("cancelRun cancels the run's job and records the run as cancelled", async () => {
    const { app, service, jobs } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["slow1", "slow2"] });

    const started = await service.spawnWorkflow("wf");
    // Nothing answers "slow1", so the run would hang forever without cancellation.
    respondToSteps(started.agent, () => null);
    await waitFor(() => app.getState(WorkflowState).getRun(started.runId)?.status === "running");

    expect(service.cancelRun(started.runId)).toBe(true);
    const state = await waitForFinishedRuns(app);
    expect(state.runs[0]).toMatchObject({ id: started.runId, status: "cancelled" });
    await waitFor(() => state.runs[0]?.stepRecords[0]?.status === "cancelled");
    expect(jobs.get(started.jobId)?.status).toBe("cancelled");
    expect(service.cancelRun(started.runId)).toBe(false);
  });

  test("cancelling before the first step runs logs no error", async () => {
    const { app, service, jobs } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });
    const serviceError = spyOn(app, "serviceError");
    const consoleError = spyOn(console, "error");

    try {
      const started = await service.spawnWorkflow("wf");
      expect(service.cancelRun(started.runId)).toBe(true);
      const state = await waitForFinishedRuns(app);
      expect(state.runs[0]).toMatchObject({ status: "cancelled", message: "Run cancelled." });
      await waitFor(() => jobs.get(started.jobId)?.status === "cancelled");
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(serviceError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      serviceError.mockRestore();
      consoleError.mockRestore();
    }
  });

  test("a run that outlasts subAgent.timeout fails as timed out, from its job's time limit", async () => {
    const { app, service, jobs } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["slow"], subAgent: { timeout: 0.2 } });

    const started = await service.spawnWorkflow("wf");
    // Nothing answers the step, so only the timeout can end it.
    respondToSteps(started.agent, () => null);

    const state = await waitForFinishedRuns(app);
    expect(state.runs[0]).toMatchObject({ status: "failed", message: "Workflow stopped: Timed out after 0.2 seconds" });
    expect(state.runs[0]!.stepRecords[0]!.status).toBe("failed");
    expect(jobs.get(started.jobId)?.status).toBe("failed");
    // The step's input was cancelled in the agent, not left running.
    expect(started.agent.getState(AgentEventState).inputQueue).toHaveLength(0);
  });

  test("a step that spawns the same workflow is stopped by the job depth limit", async () => {
    const { app, service, jobs } = makeApp({ maxDepth: 3 });
    await service.createWorkflow("recurse", {
      displayName: "Recurse",
      agentType: "leader",
      steps: [{ command: "workflow spawn", arguments: { workflowName: "recurse" } }],
    });

    const errors: string[] = [];
    // Plays `/workflow spawn recurse` in each run's agent: starts the run from that agent and waits for it, like a nested call.
    const answerSpawns = (agent: Agent) =>
      respondToSteps(agent, async () => {
        try {
          const child = await service.spawnWorkflow("recurse", { startedBy: agent });
          answerSpawns(child.agent);
          await waitFor(() => isRunFinished(app.getState(WorkflowState).getRun(child.runId)?.status ?? "running"), 4000);
          return { status: "success", message: `started ${child.runId}` };
        } catch (error) {
          errors.push((error as Error).message);
          return { status: "error", message: (error as Error).message };
        }
      });

    const top = await service.spawnWorkflow("recurse");
    answerSpawns(top.agent);

    const state = await waitForFinishedRuns(app, 4);
    // Three nested runs (depths 1-3); the fourth is refused, not started.
    expect(state.runs).toHaveLength(4);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("agent.jobs.maxDepth");
    const refused = state.runs.find(run => run.jobId === null)!;
    expect(refused).toMatchObject({ status: "failed" });
    expect(refused.message).toContain("Could not start the run");
    const deepest = state.runs.filter(run => run.status === "failed" && run.jobId !== null);
    expect(deepest).toHaveLength(1);
    expect(deepest[0]!.message).toContain("agent.jobs.maxDepth");
    expect(jobs.get(deepest[0]!.jobId!)?.depth).toBe(3);
    expect(state.runs.filter(run => run.status === "completed")).toHaveLength(2);
  });

  test("cancelling a run cancels the runs it started", async () => {
    const { app, service, jobs } = makeApp();
    await service.createWorkflow("parent", { displayName: "Parent", agentType: "leader", steps: ["start child", "wait"] });
    await service.createWorkflow("child", { displayName: "Child", agentType: "leader", steps: ["work forever"] });

    let child: Awaited<ReturnType<WorkflowService["spawnWorkflow"]>> | null = null;
    const parent = await service.spawnWorkflow("parent");
    respondToSteps(parent.agent, async message => {
      if (message !== "start child") return null;
      child = await service.spawnWorkflow("child", { startedBy: parent.agent });
      respondToSteps(child.agent, () => null);
      return { status: "success", message: "child started" };
    });

    await waitFor(() => app.getState(WorkflowState).getRun(parent.runId)?.currentStep === 1);
    const childRun = child as unknown as Awaited<ReturnType<WorkflowService["spawnWorkflow"]>>;
    expect(jobs.get(childRun.jobId)?.parentJobId).toBe(parent.jobId);

    expect(service.cancelRun(parent.runId)).toBe(true);
    const state = await waitForFinishedRuns(app, 2);
    expect(state.getRun(childRun.runId)).toMatchObject({ status: "cancelled" });
    expect(state.getRun(childRun.runId)?.message).toContain("parent job was stopped");
    expect(jobs.get(childRun.jobId)?.status).toBe("cancelled");
  });

  test("finished runs are persisted under .runs and restored by a new service", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });
    const { agent } = await service.spawnWorkflow("wf");
    respondToSteps(agent, succeed);
    const state = await waitForFinishedRuns(app);
    const runId = state.runs[0]!.id;

    const runFile = path.join(service.getWorkflowDirectory(), ".runs", `${runId}.json`);
    await waitFor(() => fs.existsSync(runFile) && JSON.parse(fs.readFileSync(runFile, "utf8")).status === "completed");
    const persisted = JSON.parse(fs.readFileSync(runFile, "utf8"));
    expect(persisted).toMatchObject({ id: runId, status: "completed", workflowName: "wf" });
    expect(persisted.stepRecords).toHaveLength(1);
    expect(persisted.stepRecords[0]).toMatchObject({ status: "done", output: "ran step1" });

    // A fresh service over the same directory restores the run history, once however often it loads.
    const revivedApp = createTestingApp();
    const revivedService = new WorkflowService(revivedApp);
    revivedService.reconfigure({ maxFinishedRuns: 50, workflowDirectory: service.getWorkflowDirectory() });
    await revivedService.loadRunHistory();
    await revivedService.loadRunHistory();
    expect(revivedService.getRuns().filter(candidate => candidate.id === runId)).toHaveLength(1);
    expect(revivedService.getRuns().find(candidate => candidate.id === runId)).toMatchObject({ id: runId, status: "completed" });
  });

  test("a run already in state is not duplicated when the history loads", async () => {
    const { app, service } = makeApp();
    const runsDirectory = path.join(service.getWorkflowDirectory(), ".runs");
    fs.mkdirSync(runsDirectory, { recursive: true });
    const run = app.mutateState(WorkflowState, state =>
      state.addRun({ id: "dup-run", workflowName: "wf", displayName: "WF", agentType: "leader", steps: ["a"] }),
    );
    app.mutateState(WorkflowState, state => state.finishRun(run.id, "completed", "done"));
    fs.writeFileSync(path.join(runsDirectory, "dup-run.json"), JSON.stringify({ ...run, status: "completed", message: "from disk" }));

    await service.loadRunHistory();
    expect(service.getRuns().filter(candidate => candidate.id === "dup-run")).toHaveLength(1);
    expect(service.getRuns().find(candidate => candidate.id === "dup-run")?.message).toBe("done");
  });

  test("runs in flight at a restart are restored as interrupted, and run again only when asked", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });
    const runsDirectory = path.join(service.getWorkflowDirectory(), ".runs");
    fs.mkdirSync(runsDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(runsDirectory, "stuck-run.json"),
      JSON.stringify({
        id: "stuck-run",
        workflowName: "wf",
        displayName: "WF",
        agentType: "leader",
        agentId: "agent-1",
        steps: ["step1"],
        stepRecords: [{ label: "step1", status: "running", startedAt: Date.now(), finishedAt: null, output: "" }],
        currentStep: 0,
        status: "running",
        message: "",
        startedAt: Date.now(),
        finishedAt: null,
      }),
    );

    await service.loadRunHistory();
    const restored = service.getRuns().find(candidate => candidate.id === "stuck-run");
    expect(restored).toMatchObject({ status: "interrupted", jobId: null });
    expect(restored?.message).toContain("Run again");
    expect(restored?.stepRecords[0]?.status).toBe("cancelled");
    // Saved as interrupted, and nothing was started on its own.
    expect(JSON.parse(fs.readFileSync(path.join(runsDirectory, "stuck-run.json"), "utf8")).status).toBe("interrupted");
    expect(service.getRuns()).toHaveLength(1);

    const again = await service.rerunRun("stuck-run");
    respondToSteps(again.agent, succeed);
    const state = await waitForFinishedRuns(app, 2);
    expect(state.getRun(again.runId)).toMatchObject({ status: "completed", rerunOf: "stuck-run", workflowName: "wf" });
    await expect(service.rerunRun("missing")).rejects.toThrow("not found");
  });

  test("history loads before any prune, so records from the last session survive a run finishing during startup", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });
    const runsDirectory = path.join(service.getWorkflowDirectory(), ".runs");
    fs.mkdirSync(runsDirectory, { recursive: true });
    const oldRun = {
      id: "old-run",
      workflowName: "wf",
      displayName: "WF",
      agentType: "leader",
      agentId: null,
      steps: ["a"],
      currentStep: 1,
      status: "completed",
      message: "",
      startedAt: 1,
      finishedAt: 2,
    };
    fs.writeFileSync(path.join(runsDirectory, "old-run.json"), JSON.stringify(oldRun));

    const loading = service.loadRunHistory();
    const started = await service.spawnWorkflow("wf");
    service.cancelRun(started.runId);
    await loading;
    await waitForFinishedRuns(app, 2);
    await waitForFile(path.join(runsDirectory, `${started.runId}.json`));
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(fs.existsSync(path.join(runsDirectory, "old-run.json"))).toBe(true);
    expect(service.getRuns().map(run => run.id)).toContain("old-run");
  });

  test("failed steps under onError=continue finish the run as completedWithErrors", async () => {
    const { app, service, jobs } = makeApp();
    await service.createWorkflow("wf", {
      displayName: "WF",
      agentType: "leader",
      steps: [{ command: "flaky", retries: 1 }, "fine", { command: "doomed", onError: "continue" }, "never reached if continue is broken"],
    });

    const started = await service.spawnWorkflow("wf");
    let flakyAttempts = 0;
    const executed = respondToSteps(started.agent, message => {
      if (message === "/flaky") {
        flakyAttempts += 1;
        return flakyAttempts === 1 ? { status: "error", message: "flaky first try" } : { status: "success", message: "flaky second try" };
      }
      if (message === "/doomed") return { status: "error", message: "doomed always fails" };
      return succeed(message);
    });

    const state = await waitForFinishedRuns(app);

    // /flaky ran twice (one retry); the doomed step failed but the run continued.
    expect(executed.filter(message => message === "/flaky")).toHaveLength(2);
    expect(executed).toContain("never reached if continue is broken");
    expect(state.runs[0]).toMatchObject({ status: "completedWithErrors", currentStep: 4, message: 'Workflow "wf" completed with 1 failed step' });
    // The job counts as failed, so its agent is kept for an hour to inspect the failed step.
    expect(jobs.get(started.jobId)?.status).toBe("failed");

    const records = state.runs[0]?.stepRecords ?? [];
    expect(records.map(record => record.status)).toEqual(["done", "done", "failed", "done"]);
    expect(records[0]?.output).toContain("[retried 1x]");
    expect(records[2]?.output).toContain("doomed always fails");
  });

  test("step outputs and run messages are truncated, including the finish message", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["big", "fail"] });
    const huge = "x".repeat(MAX_STEP_OUTPUT_CHARS * 3);

    const { agent } = await service.spawnWorkflow("wf");
    respondToSteps(agent, message => (message === "big" ? { status: "success", message: huge } : { status: "error", message: huge }));
    const state = await waitForFinishedRuns(app);

    const run = state.runs[0]!;
    expect(run.status).toBe("failed");
    expect(run.message.length).toBeLessThanOrEqual(MAX_STEP_OUTPUT_CHARS + 1);
    for (const record of run.stepRecords) expect(record.output.length).toBeLessThanOrEqual(MAX_STEP_OUTPUT_CHARS + 1);
  });

  test("retries are capped at MAX_STEP_RETRIES", async () => {
    const { service } = makeApp();
    await expect(
      service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: [{ command: "x", retries: MAX_STEP_RETRIES + 1 }] }),
    ).rejects.toThrow();
    await service.createWorkflow("ok", { displayName: "WF", agentType: "leader", steps: [{ command: "x", retries: MAX_STEP_RETRIES }] });
  });

  test("maxFinishedRuns trims finished runs in memory and on disk", async () => {
    const { app, service } = makeApp();
    service.reconfigure({ maxFinishedRuns: 2, workflowDirectory: service.getWorkflowDirectory() });
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });

    const runIds: string[] = [];
    for (let index = 0; index < 3; index++) {
      const started = await service.spawnWorkflow("wf");
      runIds.push(started.runId);
      respondToSteps(started.agent, succeed);
      await waitFor(() => isRunFinished(app.getState(WorkflowState).getRun(started.runId)?.status ?? "running"));
    }

    const survivingIds = app.getState(WorkflowState).runs.map(run => run.id);
    expect(survivingIds).toEqual([runIds[1]!, runIds[2]!]);

    // Disk retention matches: exactly the two surviving run files remain.
    await waitFor(() => {
      const entries = fs.readdirSync(path.join(service.getWorkflowDirectory(), ".runs")).filter(entry => entry.endsWith(".json"));
      return entries.length === 2 && entries.every(entry => survivingIds.some(id => entry === `${id}.json`));
    });
  });

  test("spawnWorkflow refuses unknown workflows, unknown agent types and misordered positionals without recording a run", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "does-not-exist", steps: ["step1"] });
    await service.createWorkflow("shifty", { displayName: "Shifty", agentType: "leader", steps: [{ command: "pair", arguments: { second: "b" } }] });
    const commands = new AgentCommandService();
    commands.addAgentCommands({
      name: "pair",
      description: "Two optional positionals",
      help: "",
      inputSchema: {
        positionals: [
          { name: "first", description: "First", required: false },
          { name: "second", description: "Second", required: false },
        ],
      },
      execute: async () => "ok",
    });
    app.addService(AgentCommandService, commands);

    await expect(service.spawnWorkflow("ghost")).rejects.toThrow('Workflow "ghost" not found.');
    await expect(service.spawnWorkflow("wf")).rejects.toThrow('uses agent type "does-not-exist", which does not exist.');
    await expect(service.spawnWorkflow("shifty")).rejects.toThrow('step 1 is invalid: Step /pair: positional "first" is empty');
    expect(app.getState(WorkflowState).runs).toEqual([]);
  });
});
