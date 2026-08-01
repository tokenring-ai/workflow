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
    app.addService(agentManager);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-workflow-"));
    tempDirs.push(dir);

    const service = new WorkflowService(app);
    service.reconfigure({ maxFinishedRuns: 50, workflowDirectory: dir });
    app.addService(service);
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

  function waitForFinishedRun(app: TokenRingApp): Promise<WorkflowState> {
    return app.timedWaitForState(WorkflowState, state => state.runs.length > 0 && state.runs.every(run => isRunFinished(run.status)), 5000);
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
    expect(state.runs[0]).toMatchObject({ currentStep: 1, status: "failed", message: "step2 blew up" });
  });

  test("spawnWorkflow refuses unknown workflows and unknown agent types without recording a run", async () => {
    const { app, service } = makeApp();
    await service.createWorkflow("wf", { displayName: "WF", agentType: "does-not-exist", steps: ["step1"] });

    await expect(service.spawnWorkflow("ghost", { headless: true })).rejects.toThrow('Workflow "ghost" not found.');
    await expect(service.spawnWorkflow("wf", { headless: true })).rejects.toThrow('uses agent type "does-not-exist", which does not exist.');
    expect(app.getState(WorkflowState).runs).toEqual([]);
  });
});
