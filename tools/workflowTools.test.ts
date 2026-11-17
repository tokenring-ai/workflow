import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Agent, AgentManager, LimitError } from "@tokenring-ai/agent";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import ChatService, { type CheckToolApprovalOptions } from "@tokenring-ai/chat/ChatService";
import { ApprovalLevel } from "@tokenring-ai/chat/schema";
import WorkflowService from "../WorkflowService.ts";
import createWorkflow from "./createWorkflow.ts";
import getWorkflow from "./getWorkflow.ts";
import listWorkflows from "./listWorkflows.ts";
import runWorkflow from "./runWorkflow.ts";
import updateWorkflow from "./updateWorkflow.ts";

describe("workflow tools", () => {
  let app: ReturnType<typeof createTestingApp>;
  let agent: ReturnType<typeof createTestingAgent>;
  let service: WorkflowService;
  let tempDir: string;
  let approve: ReturnType<typeof spyOn>;

  beforeEach(() => {
    app = createTestingApp();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-workflow-tools-"));
    service = new WorkflowService(app as unknown as TokenRingApp);
    service.reconfigure({ maxFinishedRuns: 50, workflowDirectory: tempDir });
    app.addService(WorkflowService, service);
    agent = createTestingAgent(app);
    const agentManager = app.requireService(AgentManager);
    spyOn(agentManager, "getAgentConfig").mockImplementation((type: string) => (type === "leader" ? ({} as never) : undefined));
    approve = spyOn(agent, "askForApproval").mockResolvedValue(true);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const input = {
    name: "triage",
    displayName: "Triage",
    description: "Sorts issues",
    agentType: "leader",
    steps: ["Read the open issues", { command: "agent run", arguments: { type: "x" }, remainder: "label them", onError: "continue" as const, retries: 1 }],
  };

  test("workflow_create asks for approval, then writes the workflow", async () => {
    const result = await createWorkflow.execute(createWorkflow.inputSchema.parse(input), agent);

    expect(approve).toHaveBeenCalledTimes(1);
    const message = (approve.mock.calls[0]![0] as { message: string }).message;
    expect(message).toContain("Workflow: triage — Triage");
    expect(message).toContain("2. /agent run --type x label them (continue on error, 1 retries)");
    expect(JSON.parse(result.result as string).workflow).toMatchObject({ name: "triage", stepCount: 2 });
    expect((await service.getWorkflow("triage"))?.steps[1]).toMatchObject({ onError: "continue", retries: 1 });
  });

  test("workflow_create writes nothing when the user declines", async () => {
    approve.mockResolvedValue(false);
    await expect(createWorkflow.execute(createWorkflow.inputSchema.parse(input), agent)).rejects.toThrow("did not approve");
    expect(await service.getWorkflow("triage")).toBeNull();
  });

  test("workflow_create refuses existing names and unknown agent types without asking", async () => {
    await service.createWorkflow("triage", { displayName: "Old", agentType: "leader" });
    await expect(createWorkflow.execute(createWorkflow.inputSchema.parse(input), agent)).rejects.toThrow("already exists");
    await expect(createWorkflow.execute(createWorkflow.inputSchema.parse({ ...input, name: "other", agentType: "ghost" }), agent)).rejects.toThrow(
      'Agent type "ghost" does not exist',
    );
    expect(approve).not.toHaveBeenCalled();
  });

  test("workflow_update merges only the given fields after approval", async () => {
    await service.createWorkflow("triage", { displayName: "Triage", description: "Sorts issues", agentType: "leader", steps: ["a"] });

    await updateWorkflow.execute(updateWorkflow.inputSchema.parse({ name: "triage", description: "Sorts and labels issues" }), agent);

    expect((approve.mock.calls[0]![0] as { message: string }).message).toContain("changing description");
    expect(await service.getWorkflow("triage")).toMatchObject({ displayName: "Triage", description: "Sorts and labels issues", steps: ["a"] });
  });

  test("workflow_update does not undo a save made while its approval was open", async () => {
    await service.createWorkflow("triage", { displayName: "Triage", description: "Sorts issues", agentType: "leader", steps: ["a"] });
    approve.mockImplementation(async () => {
      // The user saves from the editor before answering.
      await new Promise(resolve => setTimeout(resolve, 15));
      const { name: _name, updatedAt: _updatedAt, ...current } = (await service.getWorkflow("triage"))!;
      await service.updateWorkflow("triage", { ...current, steps: ["a", "b"] });
      return true;
    });

    await expect(updateWorkflow.execute(updateWorkflow.inputSchema.parse({ name: "triage", description: "Changed" }), agent)).rejects.toThrow(
      "changed by someone else",
    );
    expect(await service.getWorkflow("triage")).toMatchObject({ description: "Sorts issues", steps: ["a", "b"] });
  });

  test("workflow_update rejects missing workflows and empty changes", async () => {
    await expect(updateWorkflow.execute(updateWorkflow.inputSchema.parse({ name: "nope", description: "x" }), agent)).rejects.toThrow("not found");
    await service.createWorkflow("triage", { displayName: "Triage", agentType: "leader" });
    await expect(updateWorkflow.execute(updateWorkflow.inputSchema.parse({ name: "triage" }), agent)).rejects.toThrow("Nothing to update");
    approve.mockResolvedValue(false);
    await expect(updateWorkflow.execute(updateWorkflow.inputSchema.parse({ name: "triage", displayName: "New" }), agent)).rejects.toThrow("did not approve");
    expect((await service.getWorkflow("triage"))?.displayName).toBe("Triage");
  });

  test("workflow_list and workflow_get read without approval", async () => {
    await service.createWorkflow("triage", { displayName: "Triage", agentType: "leader", steps: ["a", "b"] });

    const listed = JSON.parse((await listWorkflows.execute({}, agent)).result as string);
    expect(listed.workflows).toEqual([expect.objectContaining({ name: "triage", displayName: "Triage", stepCount: 2 })]);
    const read = JSON.parse((await getWorkflow.execute({ name: "triage" }, agent)).result as string);
    expect(read.workflow.steps).toEqual(["a", "b"]);
    await expect(getWorkflow.execute({ name: "missing" }, agent)).rejects.toThrow("not found");
    expect(approve).not.toHaveBeenCalled();
  });

  describe("workflow_run", () => {
    /** Answers ChatService.checkToolApproval for the agent; the rest of requireService is the real one. */
    function stubApproval(approved: boolean) {
      const checkToolApproval = spyOn({ check: async (_options: CheckToolApprovalOptions, _agent: Agent) => approved }, "check");
      const requireService = agent.requireService.bind(agent);
      spyOn(agent, "requireService").mockImplementation(((cls: unknown) =>
        cls === ChatService ? { checkToolApproval } : requireService(cls as never)) as typeof agent.requireService);
      return checkToolApproval;
    }

    test("asks at CostlyChange, then starts the run from the calling agent and returns its id", async () => {
      await service.createWorkflow("triage", { displayName: "Triage", agentType: "leader", steps: ["a", "b"] });
      const checkToolApproval = stubApproval(true);
      const spawn = spyOn(service, "spawnWorkflow").mockResolvedValue({ runId: "run-1", jobId: "job-1", agent: { id: "agent-9" } as Agent });

      const result = await runWorkflow.execute(runWorkflow.inputSchema.parse({ name: "triage" }), agent);

      expect(checkToolApproval).toHaveBeenCalledTimes(1);
      expect(checkToolApproval.mock.calls[0]![0]).toMatchObject({ toolName: "workflow_run", safetyLevel: ApprovalLevel.CostlyChange });
      // Origin = the calling agent, so the engine's depth, fan-out and cancel cascade apply.
      expect(spawn).toHaveBeenCalledWith("triage", { startedBy: agent });
      expect(JSON.parse(result.result as string)).toMatchObject({ runId: "run-1", jobId: "job-1", agentId: "agent-9", steps: 2 });
    });

    test("starts nothing when not approved, or for an unknown workflow", async () => {
      await service.createWorkflow("triage", { displayName: "Triage", agentType: "leader", steps: ["a"] });
      stubApproval(false);
      const spawn = spyOn(service, "spawnWorkflow");
      await expect(runWorkflow.execute({ name: "triage" }, agent)).rejects.toThrow("did not approve");
      await expect(runWorkflow.execute({ name: "missing" }, agent)).rejects.toThrow('Workflow "missing" not found');
      expect(spawn).not.toHaveBeenCalled();
    });

    test("reports a job limit refusal to the model", async () => {
      await service.createWorkflow("triage", { displayName: "Triage", agentType: "leader", steps: ["a"] });
      stubApproval(true);
      spyOn(service, "spawnWorkflow").mockRejectedValue(new LimitError("maxDepth", "jobs may nest at most 3 deep (agent.jobs.maxDepth)."));
      await expect(runWorkflow.execute({ name: "triage" }, agent)).rejects.toThrow("The workflow was not started: jobs may nest at most 3 deep");
    });
  });
});
