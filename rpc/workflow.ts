import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import WorkflowService from "../WorkflowService.ts";
import WorkflowRpcSchema from "./schema.ts";

export default createRPCEndpoint(WorkflowRpcSchema, {
  listWorkflows(_args, app: TokenRingApp) {
    const workflowService = app.requireService(WorkflowService);
    const workflows = workflowService.listWorkflowEntries();

    return workflows.map(([name, workflow]) => ({
      name,
      displayName: workflow.displayName,
      description: workflow.description,
      agentType: workflow.agentType,
      steps: workflow.steps,
    }));
  },

  getWorkflow(args, app: TokenRingApp) {
    const workflowService = app.requireService(WorkflowService);
    const workflow = workflowService.getWorkflow(args.name);

    if (!workflow) {
      throw new Error(`Workflow "${args.name}" not found`);
    }

    return {
      key: args.name,
      displayName: workflow.displayName,
      description: workflow.description,
      agentType: workflow.agentType,
      steps: workflow.steps,
    };
  },

  spawnWorkflow(args, app: TokenRingApp) {
    const workflowService = app.requireService(WorkflowService);

    const agent = workflowService.spawnWorkflow(args.name, {
      headless: args.headless,
    });

    return {
      id: agent.id,
      displayName: agent.displayName,
      description: agent.config.description,
    };
  },
});
