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
    workflowService.reconfigure({ workflowDirectory });
    app.addServices(workflowService);

    agent = createTestingAgent(app);
    agent.config.headless = false;
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
    it("should spawn an agent for the workflow", async () => {
      spyOn(workflowService, "spawnWorkflow").mockResolvedValue({ id: "spawned-agent-123" } as Agent);

      const result = await workflowSpawnCommand.execute({
        positionals: { workflowName: "testWorkflow" },
        args: {},
        agent,
      });

      expect(result).toContain("Spawned agent spawned-agent-123 for workflow: Test Workflow");
      expect(workflowService.spawnWorkflow).toHaveBeenCalledWith("testWorkflow", { headless: false });
    });

    it("should inherit headless mode from the current agent", async () => {
      agent.config.headless = true;
      spyOn(workflowService, "spawnWorkflow").mockResolvedValue({ id: "spawned-agent-123" } as Agent);

      await workflowSpawnCommand.execute({
        positionals: { workflowName: "complexWorkflow" },
        args: {},
        agent,
      });

      expect(workflowService.spawnWorkflow).toHaveBeenCalledWith("complexWorkflow", { headless: true });
    });

    it("should show error for non-existent workflow", async () => {
      expect(
        workflowSpawnCommand.execute({
          positionals: { workflowName: "nonExistentWorkflow" },
          args: {},
          agent,
        }),
      ).rejects.toThrow('Workflow "nonExistentWorkflow" not found.');
    });
  });
});
