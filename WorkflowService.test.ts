import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Agent, AgentManager } from "@tokenring-ai/agent";
import { AgentConfigSchema } from "@tokenring-ai/agent/schema";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { YAML } from "bun";
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
    expect((await service.getWorkflow("bugHunter"))?.displayName).toBe("Renamed");
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

  afterEach(() => {
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
    headless: true,
  });

  /** A fresh app with an AgentManager that knows about the `leader` agent type. */
  function makeApp(): { app: TokenRingApp; service: WorkflowService } {
    const app = createTestingApp();
    const agentManager = new AgentManager(app);
    agentManager.addAgentConfigs(agentConfig);
    app.addService(AgentManager, agentManager);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-workflow-"));
    tempDirs.push(dir);

    const service = new WorkflowService(app);
    service.reconfigure({ maxFinishedRuns: 50, workflowDirectory: dir });
    app.addService(WorkflowService, service);
    return { app, service };
  }

  /**
   * Stands in for the agent's command loop: answers every input the workflow sends with the outcome
   * `respond` returns, recording the step messages it saw.
   */
  function respondToSteps(agent: Agent, respond: (message: string) => { status: "success" | "error" | "cancelled"; message: string }): string[] {
    const executed: string[] = [];
    const cursor = agent.getState(AgentEventState).getEventCursorFromCurrentPosition();
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
          const outcome = respond(event.input.message);
          agent.mutateState(AgentEventState, eventState =>
            eventState.emit({ type: "agent.response", requestId: event.requestId, status: outcome.status, message: outcome.message, timestamp: Date.now() }),
          );
        }
      }
    })();

    return executed;
  }

  function waitForFinishedRun(app: TokenRingApp): Promise<Readonly<WorkflowState>> {
    return app.timedWaitForState(
      WorkflowState,
      state => state.runs.length > 0 && state.runs.every(run => isRunFinished(run.status)),
      5000,
      new AbortController().signal,
    );
  }

  /** Polls `condition` (sync or async) until truthy; rethrows the last value check on timeout. */
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

  test("spawnWorkflow records a run and walks it through every step", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1", "step2"] });

    const agent = await service.spawnWorkflow("wf", { headless: true });
    const executed = respondToSteps(agent, message => ({ status: "success", message: `ran ${message}` }));

    const state = await waitForFinishedRun(app);

    expect(executed).toEqual(["step1", "step2"]);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toMatchObject({
      workflowName: "wf",
      displayName: "WF",
      agentType: "leader",
      agentId: agent.id,
      steps: ["step1", "step2"],
      currentStep: 2,
      status: "completed",
    });
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

    const agent = await service.spawnWorkflow("wf", { headless: true });
    const executed = respondToSteps(agent, message => ({ status: "success", message: `ran ${message}` }));
    await waitForFinishedRun(app);

    expect(executed).toEqual(["plain chat", "/agent run --type leader --bg do work"]);
  });

  test("a failing step stops the run and records where it stopped", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1", "step2", "step3"] });

    const agent = await service.spawnWorkflow("wf", { headless: true });
    const executed = respondToSteps(agent, message =>
      message === "step2" ? { status: "error", message: "step2 blew up" } : { status: "success", message: `ran ${message}` },
    );

    const state = await waitForFinishedRun(app);

    expect(executed).toEqual(["step1", "step2"]);
    expect(state.runs[0]).toMatchObject({ currentStep: 1, status: "failed", message: "Step 2 failed: step2 blew up" });
    // Per-step records capture what each step did.
    const records = state.runs[0]?.stepRecords ?? [];
    expect(records.map(record => record.status)).toEqual(["done", "failed", "pending"]);
    expect(records[0]).toMatchObject({ label: "step1", output: "ran step1" });
    expect(records[1]?.output).toContain("step2 blew up");
  });

  test("cancelRun aborts an in-flight run and terminates its agent", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["slow1", "slow2"] });

    const agent = await service.spawnWorkflow("wf", { headless: true });
    const run = app.getState(WorkflowState).runs[0]!;
    // The responder never answers "slow1", so the run would hang forever without cancellation.
    respondToSteps(agent, () => ({ status: "success", message: "never sent" }));

    expect(service.cancelRun(run.id)).toBe(true);
    const state = await waitForFinishedRun(app);
    expect(state.runs[0]).toMatchObject({ id: run.id, status: "cancelled" });
    expect(service.cancelRun(run.id)).toBe(false);
  });

  test("finished runs are persisted under .runs and restored by a new service", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });
    const agent = await service.spawnWorkflow("wf", { headless: true });
    respondToSteps(agent, message => ({ status: "success", message: `ran ${message}` }));
    const state = await waitForFinishedRun(app);
    const runId = state.runs[0]!.id;

    const runFile = path.join(service.getWorkflowDirectory(), ".runs", `${runId}.json`);
    await waitForFile(runFile);
    const persisted = JSON.parse(fs.readFileSync(runFile, "utf8"));
    expect(persisted).toMatchObject({ id: runId, status: "completed", workflowName: "wf" });
    expect(persisted.stepRecords).toHaveLength(1);
    expect(persisted.stepRecords[0]).toMatchObject({ status: "done", output: "ran step1" });

    // A fresh service over the same directory restores the run history.
    const revivedApp = createTestingApp();
    const revivedService = new WorkflowService(revivedApp);
    revivedService.reconfigure({ maxFinishedRuns: 50, workflowDirectory: service.getWorkflowDirectory() });
    await revivedService.loadRunHistory();
    const restored = revivedService.getRuns().find(candidate => candidate.id === runId);
    expect(restored).toMatchObject({ id: runId, status: "completed" });
  });

  test("runs that were still in flight when persisted are restored as cancelled", async () => {
    const { service } = makeApp();
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
        currentStep: 0,
        status: "running",
        message: "",
        startedAt: Date.now(),
        finishedAt: null,
      }),
    );

    await service.loadRunHistory();
    const restored = service.getRuns().find(candidate => candidate.id === "stuck-run");
    expect(restored).toMatchObject({ status: "cancelled", message: "Interrupted by an application restart" });
  });

  test("steps retry on failure and onError=continue lets the run finish", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", {
      displayName: "WF",
      agentType: "leader",
      steps: [{ command: "flaky", retries: 1 }, "fine", { command: "doomed", onError: "continue" }, "never reached if continue is broken"],
    });

    const agent = await service.spawnWorkflow("wf", { headless: true });
    let flakyAttempts = 0;
    const executed = respondToSteps(agent, message => {
      if (message === "/flaky") {
        flakyAttempts += 1;
        return flakyAttempts === 1 ? { status: "error", message: "flaky first try" } : { status: "success", message: "flaky second try" };
      }
      if (message === "/doomed") return { status: "error", message: "doomed always fails" };
      return { status: "success", message: `ran ${message}` };
    });

    const state = await waitForFinishedRun(app);

    // /flaky ran twice (one retry); the doomed step failed but the run continued.
    expect(executed.filter(message => message === "/flaky")).toHaveLength(2);
    expect(executed).toContain("never reached if continue is broken");
    expect(state.runs[0]).toMatchObject({ status: "completed", currentStep: 4 });

    const records = state.runs[0]?.stepRecords ?? [];
    expect(records.map(record => record.status)).toEqual(["done", "done", "failed", "done"]);
    expect(records[0]?.output).toContain("[retried 1x]");
    expect(records[2]?.output).toContain("doomed always fails");
  });

  test("maxFinishedRuns trims finished runs in memory and on disk", async () => {
    const { app, service } = makeApp();
    service.reconfigure({ maxFinishedRuns: 2, workflowDirectory: service.getWorkflowDirectory() });
    await service.createWorkflow("wf", { displayName: "WF", agentType: "leader", steps: ["step1"] });

    const runIds: string[] = [];
    for (let index = 0; index < 3; index++) {
      const agent = await service.spawnWorkflow("wf", { headless: true });
      runIds.push(app.getState(WorkflowState).runs[app.getState(WorkflowState).runs.length - 1]!.id);
      respondToSteps(agent, message => ({ status: "success", message: `ran ${message}` }));
    }
    // All three runs finish; retention trims the oldest finished run, keeping the two newest.
    await waitForFinishedRun(app);

    const survivingIds = app.getState(WorkflowState).runs.map(run => run.id);
    expect(survivingIds).toHaveLength(2);
    expect(survivingIds).toEqual([runIds[1]!, runIds[2]!]);

    // Disk retention matches: exactly the two surviving run files remain.
    await waitFor(() => {
      const entries = fs.readdirSync(path.join(service.getWorkflowDirectory(), ".runs")).filter(entry => entry.endsWith(".json"));
      return entries.length === 2 && entries.every(entry => survivingIds.some(id => entry === `${id}.json`));
    });
  });

  test("spawnWorkflow refuses unknown workflows and unknown agent types without recording a run", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "does-not-exist", steps: ["step1"] });

    await expect(service.spawnWorkflow("ghost", { headless: true })).rejects.toThrow('Workflow "ghost" not found.');
    await expect(service.spawnWorkflow("wf", { headless: true })).rejects.toThrow('uses agent type "does-not-exist", which does not exist.');
    expect(app.getState(WorkflowState).runs).toEqual([]);
  });
});
