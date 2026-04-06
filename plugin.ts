import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {RpcService} from "@tokenring-ai/rpc";
import {z} from "zod";
import agentCommands from "./commands.ts";
import packageJSON from "./package.json" with {type: "json"};
import workflowRPC from "./rpc/workflow";
import {WorkflowConfigSchema} from "./schema.ts";
import WorkflowService from "./WorkflowService";

const packageConfigSchema = z.object({
  workflows: WorkflowConfigSchema.prefault({})
});

export default {
  name: packageJSON.name,
  displayName: "Workflow Orchestration",
  version: packageJSON.version,
  description: packageJSON.description,
  async install(app, config) {
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(agentCommands)
    );
    const workflowService = new WorkflowService(app, config.workflows);
    app.addServices(workflowService);

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(workflowRPC);
    });
  },

  async reconfigure(app, config) {
    await app.requireService(WorkflowService).reconfigure(config.workflows);
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;