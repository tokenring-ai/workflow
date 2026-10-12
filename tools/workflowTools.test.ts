import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentManager } from "@tokenring-ai/agent";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import WorkflowService from "../WorkflowService.ts";
import createWorkflow from "./createWorkflow.ts";
import getWorkflow from "./getWorkflow.ts";
import listWorkflows from "./listWorkflows.ts";
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
});
