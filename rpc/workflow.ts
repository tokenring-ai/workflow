import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { WorkflowState } from "../state/workflowState.ts";
import WorkflowService, { type StartedRun } from "../WorkflowService.ts";
import WorkflowRpcSchema from "./schema.ts";

function startedRunResult({ runId, jobId, agent }: StartedRun) {
  return { id: agent.id, displayName: agent.displayName, description: agent.config.description, runId, jobId };
}

export default createRPCEndpoint(WorkflowRpcSchema, {
  async listWorkflows(_args, app: TokenRingApp) {
    return app.requireService(WorkflowService).listWorkflows();
  },

  getWorkflowDirectory(_args, app: TokenRingApp) {
    return { directory: app.requireService(WorkflowService).getWorkflowDirectory() };
  },

  async getWorkflow(args, app: TokenRingApp) {
    const workflow = await app.requireService(WorkflowService).getWorkflow(args.name);
    return { workflow };
  },

  async createWorkflow(args, app: TokenRingApp) {
    const workflow = await app.requireService(WorkflowService).createWorkflow(args.name, args.workflow);
    return { workflow };
  },

  async updateWorkflow(args, app: TokenRingApp) {
    const workflow = await app.requireService(WorkflowService).updateWorkflow(args.name, args.workflow);
    return { workflow };
  },

  async duplicateWorkflow(args, app: TokenRingApp) {
    const workflow = await app.requireService(WorkflowService).duplicateWorkflow(args.name, args.newName);
    return { workflow };
  },

  exportWorkflow(args, app: TokenRingApp) {
    return app.requireService(WorkflowService).exportWorkflow(args.name);
  },

  async importWorkflow(args, app: TokenRingApp) {
    const workflow = await app.requireService(WorkflowService).importWorkflow(args.yaml, args.name);
    return { workflow };
  },

  async deleteWorkflow(args, app: TokenRingApp) {
    const success = await app.requireService(WorkflowService).deleteWorkflow(args.name);
    return { success };
  },

  async *streamWorkflowRuns(_args, app: TokenRingApp, signal) {
    for await (const state of app.subscribeStateAsync(WorkflowState, signal)) {
      yield { status: "success" as const, runs: state.runs.map(run => ({ ...run })) };
    }
  },

  async spawnWorkflow(args, app: TokenRingApp) {
    return startedRunResult(await app.requireService(WorkflowService).spawnWorkflow(args.name));
  },

  async rerunRun(args, app: TokenRingApp) {
    return startedRunResult(await app.requireService(WorkflowService).rerunRun(args.runId));
  },

  cancelRun(args, app: TokenRingApp) {
    return { success: app.requireService(WorkflowService).cancelRun(args.runId) };
  },
});
