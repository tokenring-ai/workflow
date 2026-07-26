import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { WorkflowState } from "../state/workflowState.ts";
import WorkflowService from "../WorkflowService.ts";
import WorkflowRpcSchema from "./schema.ts";

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

  async deleteWorkflow(args, app: TokenRingApp) {
    const success = await app.requireService(WorkflowService).deleteWorkflow(args.name);
    return { success };
  },

  async *streamWorkflowRuns(_args, app: TokenRingApp, signal) {
    for await (const state of app.stateManager.subscribeAsync(WorkflowState, signal)) {
      yield { status: "success" as const, runs: state.runs.map(run => ({ ...run })) };
    }
  },

  async spawnWorkflow(args, app: TokenRingApp) {
    const agent = await app.requireService(WorkflowService).spawnWorkflow(args.name, {
      headless: args.headless,
    });

    return {
      id: agent.id,
      displayName: agent.displayName,
      description: agent.config.description,
    };
  },
});
