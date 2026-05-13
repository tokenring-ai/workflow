import { Agent, AgentCommandService, SubAgentService } from "@tokenring-ai/agent";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowService from "../WorkflowService";
import workflowListCommand from "./workflow/list.ts";
import workflowRunCommand from "./workflow/run.ts";
import workflowSpawnCommand from "./workflow/spawn.ts";

describe("workflow command", () => {
  let app: TokenRingApp;
  let agent: Agent;
  let workflowService: WorkflowService;
  let agentCommandService: AgentCommandService;
  let subAgentService: SubAgentService;

  const mockWorkflows = {
    testWorkflow: {
      name: "Test Workflow",
      description: "A test workflow",
      agentType: "test-agent",
      steps: ["step1", "step2", "step3"],
    },
    complexWorkflow: {
      name: "Complex Workflow",
      description: "A complex test workflow",
      agentType: "complex-agent",
      steps: ["setup", "process", "validate", "cleanup"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    app = createTestingApp();

    workflowService = new WorkflowService(app, mockWorkflows);

    agentCommandService = new AgentCommandService(app);
    subAgentService = new SubAgentService(app);

    app.addServices(workflowService);
    app.addServices(agentCommandService);
    app.addServices(subAgentService);

    agent = createTestingAgent(app);
    agent.config.headless = false;
    vi.spyOn(agent, "infoMessage");

    // Mock getAbortSignal to return a non-aborted signal
    const abortController = new AbortController();
    vi.spyOn(agent, "getAbortSignal").mockReturnValue(abortController.signal);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe("run command", () => {
    it("should execute workflow steps", async () => {
      vi.spyOn(agentCommandService, "executeAgentCommand").mockImplementation(() => Promise.resolve());

      const result = await workflowRunCommand.execute({
        positionals: { workflowName: "testWorkflow" },
        args: {},
        agent
      });

      expect(result).toContain("Workflow \"testWorkflow\" completed");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "step1");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "step2");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "step3");
    });

    it("should handle complex workflow steps", async () => {
      vi.spyOn(agentCommandService, "executeAgentCommand").mockImplementation(() => Promise.resolve());
      const result = await workflowRunCommand.execute({
        positionals: { workflowName: "complexWorkflow" },
        args: {},
        agent
      });

      expect(result).toContain("Workflow \"complexWorkflow\" completed");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "setup");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "process");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "validate");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, "cleanup");
    });

    it("should show error for non-existent workflow", async () => {
      await expect(workflowRunCommand.execute({
        positionals: { workflowName: "nonExistentWorkflow" },
        args: {},
        agent
      })).rejects.toThrow("Workflow \"nonExistentWorkflow\" not found.");
    });
  });

  describe("spawn command", () => {
    it("should spawn agent and run workflow", async () => {
      const mockRunSubAgent = vi.fn().mockResolvedValue({
        id: "spawned-agent-123",
        name: "Spawned Agent",
        config: { description: "Spawned agent description" },
      });

      vi.spyOn(subAgentService, "runSubAgent").mockImplementation(mockRunSubAgent);

      const result = await workflowSpawnCommand.execute({
        positionals: { workflowName: "testWorkflow" },
        args: {},
        agent
      });

      expect(result).toContain("Spawned agent for workflow: Test Workflow");
      expect(subAgentService.runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "test-agent",
          input: {
            from: "Workflow testWorkflow",
            message: "/workflow run testWorkflow"
          },
          headless: false,
          parentAgent: agent
        })
      );
    });

    it("should handle headless spawning", async () => {
      agent.config.headless = true;

      const mockRunSubAgent = vi.fn().mockResolvedValue({
        id: "spawned-agent-123",
        name: "Spawned Agent",
        config: { description: "Spawned agent description" },
      });

      vi.spyOn(subAgentService, "runSubAgent").mockImplementation(mockRunSubAgent);

      const result = await workflowSpawnCommand.execute({
        positionals: { workflowName: "testWorkflow" },
        args: {},
        agent
      });

      expect(subAgentService.runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
        })
      );
    });

    it("should show error for non-existent workflow", async () => {
      await expect(workflowSpawnCommand.execute({
        positionals: { workflowName: "nonExistentWorkflow" },
        args: {},
        agent
      })).rejects.toThrow("Workflow \"nonExistentWorkflow\" not found.");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle full workflow execution flow", async () => {
      vi.spyOn(agentCommandService, "executeAgentCommand").mockImplementation(() => Promise.resolve());
      const result = await workflowRunCommand.execute({
        positionals: { workflowName: "testWorkflow" },
        args: {},
        agent
      });

      expect(result).toContain("Workflow \"testWorkflow\" completed");
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledTimes(3);
    });

    it("should handle full workflow spawn flow", async () => {
      const mockRunSubAgent = vi.fn().mockResolvedValue({
        id: "spawned-agent-123",
        name: "Spawned Agent",
        config: { description: "Spawned agent description" },
      });

      vi.spyOn(subAgentService, "runSubAgent").mockImplementation(mockRunSubAgent);

      const result = await workflowSpawnCommand.execute({
        positionals: { workflowName: "complexWorkflow" },
        args: {},
        agent
      });

      expect(result).toContain("Spawned agent for workflow: Complex Workflow");
      expect(subAgentService.runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "complex-agent",
        })
      );
    });
  });
});
