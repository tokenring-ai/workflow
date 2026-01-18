import TokenRingApp from "@tokenring-ai/app";
import {createJsonRPCEndpoint} from "@tokenring-ai/web-host/jsonrpc/createJsonRPCEndpoint";
import WorkflowService from "../WorkflowService.js";
import WorkflowRpcSchema from "./schema.ts";

export default createJsonRPCEndpoint(WorkflowRpcSchema, {
  async listWorkflows(args, app: TokenRingApp) {
    const workflowService = app.requireService(WorkflowService);
    const workflows = workflowService.listWorkflows();

    return workflows.map(({ key, workflow }) => ({
        key,
        name: workflow.name,
        description: workflow.description,
        agentType: workflow.agentType,
        steps: workflow.steps,
      }));
  },

  async getWorkflow(args, app: TokenRingApp) {
    const workflowService = app.requireService(WorkflowService);
    const workflow = workflowService.getWorkflow(args.name);

    if (!workflow) {
      throw new Error(`Workflow "${args.name}" not found`);
    }

    return {
      key: args.name,
      name: workflow.name,
      description: workflow.description,
      agentType: workflow.agentType,
      steps: workflow.steps,
    };
  },

  async spawnWorkflow(args, app: TokenRingApp) {
    const workflowService = app.requireService(WorkflowService);

    const agent = await workflowService.spawnWorkflow(args.workflowName, { headless: args.headless });

    return {
      id: agent.id,
      name: agent.name,
      description: agent.config.description,
    };
  },
});