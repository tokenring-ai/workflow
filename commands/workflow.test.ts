import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Agent } from "@tokenring-ai/agent";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { YAML } from "bun";
import WorkflowService from "../WorkflowService";
import workflowListCommand from "./workflow/list.ts";
import workflowRerunCommand from "./workflow/rerun.ts";
import workflowSpawnCommand from "./workflow/spawn.ts";

describe("workflow command", () => {
  let app: TokenRingApp;
  let agent: Agent;
  let workflowService: WorkflowService;
  let workflowDirectory: string;

  const mockWorkflows = {
    testWorkflow: {
      displayName: "Test Workflow",
      category: "User-Created Workflows",
      description: "A test workflow",
      agentType: "test-agent",
      steps: ["step1", "step2", "step3"],
    },
    complexWorkflow: {
      displayName: "Complex Workflow",
      category: "User-Created Workflows",
      description: "A complex test workflow",
      agentType: "complex-agent",
      steps: ["setup", "process", "validate", "cleanup"],
    },
  };

  beforeEach(() => {
    mock.clearAllMocks();

    app = createTestingApp();

    workflowDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tr-workflow-"));
    for (const [name, workflow] of Object.entries(mockWorkflows)) {
      fs.writeFileSync(path.join(workflowDirectory, `${name}.yaml`), YAML.stringify(workflow, null, 2));
    }

    workflowService = new WorkflowService(app);
    workflowService.reconfigure({ maxFinishedRuns: 50, workflowDirectory });
    app.addService(WorkflowService, workflowService);

    agent = createTestingAgent(app);
    agent.answerTimeoutSeconds = null;
  });

  afterEach(() => {
    fs.rmSync(workflowDirectory, { recursive: true, force: true });
  });

  describe("list command", () => {
    it("should list all workflows", async () => {
      const result = await workflowListCommand.execute({ agent });

      expect(result).toContain("Available workflows:");
      expect(result).toContain("**testWorkflow**: Test Workflow");
      expect(result).toContain("A test workflow");
      expect(result).toContain("Steps: 3");
      expect(result).toContain("**complexWorkflow**: Complex Workflow");
      expect(result).toContain("A complex test workflow");
      expect(result).toContain("Steps: 4");
    });
  });

  describe("spawn command", () => {
    it("starts the run from the calling agent, so it is that agent's job's child", async () => {
      spyOn(workflowService, "spawnWorkflow").mockResolvedValue({ runId: "run-1", jobId: "job-1", agent: { id: "spawned-agent-123" } as Agent });

      const result = await workflowSpawnCommand.execute({
        args: { workflowName: "testWorkflow" },
        agent,
      });

      expect(result).toContain("Started workflow Test Workflow as run run-1 on agent spawned-agent-123");
      expect(workflowService.spawnWorkflow).toHaveBeenCalledWith("testWorkflow", { startedBy: agent });
    });

    it("should show error for non-existent workflow", async () => {
      expect(
        workflowSpawnCommand.execute({
          args: { workflowName: "nonExistentWorkflow" },
          agent,
        }),
      ).rejects.toThrow('Workflow "nonExistentWorkflow" not found.');
    });
  });

  describe("rerun command", () => {
    const finishedRun = (status: string) =>
      ({ id: "run-9", workflowName: "testWorkflow", displayName: "Test Workflow", status }) as unknown as ReturnType<WorkflowService["getRuns"]>[number];

    it("runs an interrupted run again, from the calling agent", async () => {
      spyOn(workflowService, "getRuns").mockReturnValue([finishedRun("interrupted")]);
      spyOn(workflowService, "rerunRun").mockResolvedValue({ runId: "run-10", jobId: "job-10", agent: { id: "agent-10" } as Agent });

      const result = await workflowRerunCommand.execute({ args: { runId: "run-9" }, agent });

      expect(result).toContain("again as run run-10");
      expect(workflowService.rerunRun).toHaveBeenCalledWith("run-9", { startedBy: agent });
    });

    it("refuses a run that is still going, or unknown", async () => {
      spyOn(workflowService, "getRuns").mockReturnValue([finishedRun("running")]);
      await expect(workflowRerunCommand.execute({ args: { runId: "run-9" }, agent })).rejects.toThrow("still running");
      await expect(workflowRerunCommand.execute({ args: { runId: "nope" }, agent })).rejects.toThrow('No workflow run has id "nope"');
    });
  });
});
