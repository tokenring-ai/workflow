import { AgentCommandService, AgentManager } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import { z } from "zod";
import agentCommands from "./commands.ts";
import packageJSON from "./package.json" with { type: "json" };
import workflowRPC from "./rpc/workflow";
import { WorkflowConfigSchema } from "./schema.ts";
import WorkflowService from "./WorkflowService";

const packageConfigSchema = z.object({
  workflows: WorkflowConfigSchema.prefault({}),
});

export default {
  name: packageJSON.name,
  displayName: "Workflow Orchestration",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
    const workflowService = new WorkflowService(app, config.workflows);
    app.addServices(workflowService);

    app.waitForService(AgentManager, agentManager => {
      for (const [workflowName, workflowConfig] of Object.entries(config.workflows)) {
        const agentType = workflowConfig.agentType;
        if (!agentManager.getAgentConfig(agentType)) {
          throw new Error(`Error while processing workflow ${workflowName}: Agent ${agentType} not found`);
        }
      }
    });

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(workflowRPC);
    });
  },

  reconfigure(app, config) {
    app.requireService(WorkflowService).reconfigure(config.workflows);
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
